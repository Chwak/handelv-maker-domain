import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { TTL_POLICIES, ERROR_MESSAGES } from '../../../../utils/maker-constants';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MAKER_ENGAGEMENT_FACTS_TABLE_NAME = process.env.MAKER_ENGAGEMENT_FACTS_TABLE_NAME;
const MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME = process.env.MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME;
const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME;
const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME;
const FEATURE_FLAGS = process.env.FEATURE_FLAGS;
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || '10');

interface UpdateMakerProfileInput {
  userId?: unknown;
  businessName?: unknown;
  displayName?: unknown;
  bio?: unknown;
  serviceAreas?: unknown;
  publicEmail?: unknown;
  publicPhoneNumber?: unknown;
  websiteUrl?: unknown;
  instagramUrl?: unknown;
  tiktokUrl?: unknown;
  facebookUrl?: unknown;
  shippingPolicy?: unknown;
  customOrderPolicy?: unknown;
  cancellationPolicy?: unknown;
  publicProfileEnabled?: unknown;
}

function optionalString(v: unknown, maxLen: number): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > maxLen ? null : t;
}

function optionalStringArray(v: unknown, maxItems: number): string[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return null;
  const arr = v.filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter(Boolean);
  return arr.length > maxItems ? null : arr;
}

type FeatureFlags = {
  auditTrail: boolean;
  rateLimit: boolean;
  idempotency: boolean;
};

const parseFeatureFlags = (raw?: string | null): FeatureFlags => {
  const defaults: FeatureFlags = { auditTrail: true, rateLimit: true, idempotency: true };
  if (!raw) return defaults;
  const entries = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const overrides: Partial<FeatureFlags> = {};
  for (const entry of entries) {
    const [key, value] = entry.split('=').map((part) => part.trim());
    if (!key) continue;
    const enabled = value === undefined ? true : value.toLowerCase() === 'true';
    if (key in defaults) {
      (overrides as Record<string, boolean>)[key] = enabled;
    }
  }
  return { ...defaults, ...overrides };
};

const getHeader = (headers: Record<string, string> | undefined, name: string): string | null => {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return null;
};

const getIdempotencyId = (userId: string, action: string, key: string) => {
  return `${action}#${userId}#${key}`;
};

const getRateLimitId = (userId: string, action: string, window: string) => {
  return `rate#${action}#${userId}#${window}`;
};

export const handler = async (event: {
  arguments?: { input?: UpdateMakerProfileInput };
  identity?: { sub?: string; claims?: { sub?: string } };
  request?: { headers?: Record<string, string> };
}) => {
  initTelemetryLogger(event, { domain: "maker-domain", service: "update-maker-profile" });
  if (!MAKER_ENGAGEMENT_FACTS_TABLE_NAME || !MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME) {
    throw new Error('Internal server error');
  }
  if (!IDEMPOTENCY_TABLE_NAME || !AUDIT_TABLE_NAME) {
    throw new Error('Internal server error');
  }

  const featureFlags = parseFeatureFlags(FEATURE_FLAGS);
  const headers = event.request?.headers;
  const idempotencyKey = getHeader(headers, 'x-idempotency-key');

  const input = event.arguments?.input ?? {};
  const userId = validateId(input.userId);
  if (!userId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth || auth !== userId) throw new Error('Forbidden');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  if (featureFlags.rateLimit) {
    const window = new Date().toISOString().slice(0, 16);
    const rateId = getRateLimitId(userId, 'maker.update.profile', window);
    const rateResult = await client.send(
      new UpdateCommand({
        TableName: IDEMPOTENCY_TABLE_NAME,
        Key: { id: rateId },
        UpdateExpression: 'ADD #count :inc SET expires_at = :ttl',
        ExpressionAttributeNames: { '#count': 'count' },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':ttl': Math.floor(Date.now() / 1000) + 90,
        },
        ReturnValues: 'UPDATED_NEW',
      })
    );

    const rateCount = Number(rateResult.Attributes?.count ?? 0);
    if (rateCount > RATE_LIMIT_PER_MINUTE) {
      throw new Error('Rate limit exceeded. Please try again shortly.');
    }
  }

  if (featureFlags.idempotency && idempotencyKey) {
    const idemId = getIdempotencyId(userId, 'maker.update.profile', idempotencyKey);
    const existing = await client.send(
      new GetCommand({
        TableName: IDEMPOTENCY_TABLE_NAME,
        Key: { id: idemId },
      })
    );
    if (existing.Item?.response) {
      return JSON.parse(existing.Item.response as string);
    }
  }

  // Get existing profile
  const getResult = await client.send(
    new GetCommand({
      TableName: MAKER_ENGAGEMENT_FACTS_TABLE_NAME,
      Key: {
        pk: `MAKER#${userId}`,
        sk: 'PROFILE'
      },
    })
  );
  if (!getResult.Item) throw new Error('Maker profile not found');

  const now = new Date().toISOString();
  const currentVersion = getResult.Item.version || 0;
  const newVersion = currentVersion + 1;
  const activityKey = `UPDATE_PROFILE#${userId}#${now}`;

  // Start with existing data
  const updatedData = { ...getResult.Item.data };
  updatedData.updatedAt = now;

  // Apply updates
  if (input.businessName !== undefined) {
    const v = optionalString(input.businessName, 200);
    if (v === null) throw new Error('Invalid input format');
    updatedData.businessName = v;
  }
  if (input.displayName !== undefined) {
    const v = optionalString(input.displayName, 120);
    if (v === null) throw new Error('Invalid input format');
    updatedData.displayName = v;
  }
  if (input.bio !== undefined) {
    const v = optionalString(input.bio, 2000);
    if (v === null) throw new Error('Invalid input format');
    updatedData.bio = v;
  }
  if (input.serviceAreas !== undefined) {
    const v = optionalStringArray(input.serviceAreas, 50);
    if (v === null) throw new Error('Invalid input format');
    updatedData.serviceAreas = v;
  }
  if (input.publicEmail !== undefined) {
    const v = optionalString(input.publicEmail, 200);
    if (v === null) throw new Error('Invalid input format');
    updatedData.publicEmail = v;
  }
  if (input.publicPhoneNumber !== undefined) {
    const v = optionalString(input.publicPhoneNumber, 40);
    if (v === null) throw new Error('Invalid input format');
    updatedData.publicPhoneNumber = v;
  }
  if (input.websiteUrl !== undefined) {
    const v = optionalString(input.websiteUrl, 500);
    if (v === null) throw new Error('Invalid input format');
    updatedData.websiteUrl = v;
  }
  if (input.instagramUrl !== undefined) {
    const v = optionalString(input.instagramUrl, 200);
    if (v === null) throw new Error('Invalid input format');
    updatedData.instagramUrl = v;
  }
  if (input.tiktokUrl !== undefined) {
    const v = optionalString(input.tiktokUrl, 200);
    if (v === null) throw new Error('Invalid input format');
    updatedData.tiktokUrl = v;
  }
  if (input.facebookUrl !== undefined) {
    const v = optionalString(input.facebookUrl, 200);
    if (v === null) throw new Error('Invalid input format');
    updatedData.facebookUrl = v;
  }
  if (input.shippingPolicy !== undefined) {
    const v = optionalString(input.shippingPolicy, 2000);
    if (v === null) throw new Error('Invalid input format');
    updatedData.shippingPolicy = v;
  }
  if (input.customOrderPolicy !== undefined) {
    const v = optionalString(input.customOrderPolicy, 2000);
    if (v === null) throw new Error('Invalid input format');
    updatedData.customOrderPolicy = v;
  }
  if (input.cancellationPolicy !== undefined) {
    const v = optionalString(input.cancellationPolicy, 2000);
    if (v === null) throw new Error('Invalid input format');
    updatedData.cancellationPolicy = v;
  }
  if (input.publicProfileEnabled !== undefined) {
    if (typeof input.publicProfileEnabled !== 'boolean') throw new Error('Invalid input format');
    updatedData.publicProfileEnabled = input.publicProfileEnabled;
  }

  // Create activity data for tracking what changed
  const activityData: Record<string, unknown> = {
    type: 'PROFILE_UPDATED',
    timestamp: now,
  };
  if (input.businessName !== undefined) activityData.businessName = updatedData.businessName;
  if (input.displayName !== undefined) activityData.displayName = updatedData.displayName;
  if (input.bio !== undefined) activityData.bio = updatedData.bio;
  if (input.serviceAreas !== undefined) activityData.serviceAreas = updatedData.serviceAreas;
  if (input.publicEmail !== undefined) activityData.publicEmail = updatedData.publicEmail;
  if (input.publicPhoneNumber !== undefined) activityData.publicPhoneNumber = updatedData.publicPhoneNumber;
  if (input.websiteUrl !== undefined) activityData.websiteUrl = updatedData.websiteUrl;
  if (input.instagramUrl !== undefined) activityData.instagramUrl = updatedData.instagramUrl;
  if (input.tiktokUrl !== undefined) activityData.tiktokUrl = updatedData.tiktokUrl;
  if (input.facebookUrl !== undefined) activityData.facebookUrl = updatedData.facebookUrl;
  if (input.shippingPolicy !== undefined) activityData.shippingPolicy = updatedData.shippingPolicy;
  if (input.customOrderPolicy !== undefined) activityData.customOrderPolicy = updatedData.customOrderPolicy;
  if (input.cancellationPolicy !== undefined) activityData.cancellationPolicy = updatedData.cancellationPolicy;
  if (input.publicProfileEnabled !== undefined) activityData.publicProfileEnabled = updatedData.publicProfileEnabled;

  try {
    // Atomically create new fact and activity record
    const transactItems = [
      {
        Put: {
          TableName: MAKER_ENGAGEMENT_FACTS_TABLE_NAME,
          Item: {
            pk: `MAKER#${userId}`,
            sk: 'PROFILE',
            data: updatedData,
            timestamp: now,
            version: newVersion,
          },
          ConditionExpression: 'attribute_not_exists(pk) OR #version < :newVersion',
          ExpressionAttributeNames: {
            '#version': 'version',
          },
          ExpressionAttributeValues: {
            ':newVersion': newVersion,
          },
        },
      },
      {
        Put: {
          TableName: MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME,
          Item: {
            pk: `MAKER#${userId}`,
            sk: `ACTIVITY#${activityKey}`,
            data: activityData,
            ttl: Math.floor(Date.now() / 1000) + TTL_POLICIES.ACTIVITY_MEDIUM,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ];

    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

    if (featureFlags.auditTrail) {
      await client.send(
        new PutCommand({
          TableName: AUDIT_TABLE_NAME,
          Item: {
            userId,
            eventKey: `${now}#maker.update.profile`,
            action: 'maker.update.profile',
            changedFields: Object.keys(activityData).filter((key) => key !== 'type' && key !== 'timestamp'),
            createdAt: now,
            source: 'appsync',
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
          },
        })
      );
    }

    if (featureFlags.idempotency && idempotencyKey) {
      const idemId = getIdempotencyId(userId, 'maker.update.profile', idempotencyKey);
      await client.send(
        new PutCommand({
          TableName: IDEMPOTENCY_TABLE_NAME,
          Item: {
            id: idemId,
            response: JSON.stringify(updatedData),
            createdAt: now,
            expires_at: Math.floor(Date.now() / 1000) + 60 * 15,
          },
          ConditionExpression: 'attribute_not_exists(id)',
        })
      );
    }

    return updatedData;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.error('Profile version conflict or activity already exists', { userId });
      throw new Error('Profile update conflict. Please try again.');
    }
    console.error('Failed to update profile:', error);
    throw new Error('Failed to update profile');
  }
};