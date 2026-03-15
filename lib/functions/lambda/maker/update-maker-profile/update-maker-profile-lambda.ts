import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { ERROR_MESSAGES } from '../../../../utils/maker-constants';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MAKER_PROFILES_TABLE_NAME = process.env.MAKER_PROFILES_TABLE_NAME;
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
  profileImageUrl?: unknown;
  bannerImageUrl?: unknown;
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
  acceptCustomOrders?: unknown;
  acceptRushOrders?: unknown;
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
  if (!MAKER_PROFILES_TABLE_NAME) {
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
      TableName: MAKER_PROFILES_TABLE_NAME,
      Key: { userId },
    })
  );
  if (!getResult.Item) throw new Error('Maker profile not found');

  const now = new Date().toISOString();

  const updatedData = { ...(getResult.Item as Record<string, unknown>) };
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
  if (input.profileImageUrl !== undefined) {
    const v = optionalString(input.profileImageUrl, 500);
    if (v === null) throw new Error('Invalid input format');
    updatedData.profileImageUrl = v;
    updatedData.profileImageStatus = v ? 'READY' : null;
    updatedData.profileImageUpdatedAt = now;
  }
  if (input.bannerImageUrl !== undefined) {
    const v = optionalString(input.bannerImageUrl, 500);
    if (v === null) throw new Error('Invalid input format');
    updatedData.bannerImageUrl = v;
    updatedData.bannerImageStatus = v ? 'READY' : null;
    updatedData.bannerImageUpdatedAt = now;
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
  if (input.acceptCustomOrders !== undefined) {
    if (typeof input.acceptCustomOrders !== 'boolean') throw new Error('Invalid input format');
    updatedData.acceptCustomOrders = input.acceptCustomOrders;
  }
  if (input.acceptRushOrders !== undefined) {
    if (typeof input.acceptRushOrders !== 'boolean') throw new Error('Invalid input format');
    updatedData.acceptRushOrders = input.acceptRushOrders;
  }

  const changedFields: string[] = [];
  const activityData: Record<string, unknown> = {
    type: 'PROFILE_UPDATED',
    timestamp: now,
  };
  if (input.businessName !== undefined) { activityData.businessName = updatedData.businessName; changedFields.push('businessName'); }
  if (input.displayName !== undefined) { activityData.displayName = updatedData.displayName; changedFields.push('displayName'); }
  if (input.bio !== undefined) { activityData.bio = updatedData.bio; changedFields.push('bio'); }
  if (input.serviceAreas !== undefined) { activityData.serviceAreas = updatedData.serviceAreas; changedFields.push('serviceAreas'); }
  if (input.profileImageUrl !== undefined) { activityData.profileImageUrl = updatedData.profileImageUrl; changedFields.push('profileImageUrl'); }
  if (input.bannerImageUrl !== undefined) { activityData.bannerImageUrl = updatedData.bannerImageUrl; changedFields.push('bannerImageUrl'); }
  if (input.publicEmail !== undefined) { activityData.publicEmail = updatedData.publicEmail; changedFields.push('publicEmail'); }
  if (input.publicPhoneNumber !== undefined) { activityData.publicPhoneNumber = updatedData.publicPhoneNumber; changedFields.push('publicPhoneNumber'); }
  if (input.websiteUrl !== undefined) { activityData.websiteUrl = updatedData.websiteUrl; changedFields.push('websiteUrl'); }
  if (input.instagramUrl !== undefined) { activityData.instagramUrl = updatedData.instagramUrl; changedFields.push('instagramUrl'); }
  if (input.tiktokUrl !== undefined) { activityData.tiktokUrl = updatedData.tiktokUrl; changedFields.push('tiktokUrl'); }
  if (input.facebookUrl !== undefined) { activityData.facebookUrl = updatedData.facebookUrl; changedFields.push('facebookUrl'); }
  if (input.shippingPolicy !== undefined) { activityData.shippingPolicy = updatedData.shippingPolicy; changedFields.push('shippingPolicy'); }
  if (input.customOrderPolicy !== undefined) { activityData.customOrderPolicy = updatedData.customOrderPolicy; changedFields.push('customOrderPolicy'); }
  if (input.cancellationPolicy !== undefined) { activityData.cancellationPolicy = updatedData.cancellationPolicy; changedFields.push('cancellationPolicy'); }
  if (input.publicProfileEnabled !== undefined) { activityData.publicProfileEnabled = updatedData.publicProfileEnabled; changedFields.push('publicProfileEnabled'); }
  if (input.acceptCustomOrders !== undefined) { activityData.acceptCustomOrders = updatedData.acceptCustomOrders; changedFields.push('acceptCustomOrders'); }
  if (input.acceptRushOrders !== undefined) { activityData.acceptRushOrders = updatedData.acceptRushOrders; changedFields.push('acceptRushOrders'); }

  try {
    await client.send(
      new PutCommand({
        TableName: MAKER_PROFILES_TABLE_NAME,
        Item: updatedData,
        ConditionExpression: 'attribute_exists(userId)',
      })
    );

    if (featureFlags.auditTrail) {
      await client.send(
        new PutCommand({
          TableName: AUDIT_TABLE_NAME,
          Item: {
            userId,
            eventKey: `${now}#maker.update.profile`,
            action: 'maker.update.profile',
            changedFields,
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
      console.error('Maker profile disappeared during profile update', { userId });
      throw new Error('Maker profile not found');
    }
    console.error('Failed to update profile:', error);
    throw new Error('Failed to update profile');
  }
};