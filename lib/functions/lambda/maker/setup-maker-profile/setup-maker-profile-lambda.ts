import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { requireAuthenticatedUser, validateId, validateTimezone } from '../../../../utils/maker-validation';
import { TTL_POLICIES } from '../../../../utils/maker-constants';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";
import * as crypto from 'crypto';

const MAKER_ENGAGEMENT_FACTS_TABLE_NAME = process.env.MAKER_ENGAGEMENT_FACTS_TABLE_NAME || '';
const MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME = process.env.MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME || '';
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME || 'default';
const EVENT_SOURCE = process.env.EVENT_SOURCE || 'hand-made.maker-domain';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface TraceContext {
  traceparent: string;
  trace_id: string;
  span_id: string;
}

/**
 * Resolves trace context from incoming Lambda event headers
 * Supports both HTTP API Gateway and AppSync header formats
 */
function resolveTraceContext(event: any): TraceContext {
  const headerTraceparent = event.headers?.traceparent || event.headers?.Traceparent;
  
  if (headerTraceparent) {
    const parts = headerTraceparent.split('-');
    if (parts.length >= 4) {
      return {
        traceparent: headerTraceparent,
        trace_id: parts[1],
        span_id: parts[2],
      };
    }
  }

  // Generate new trace context if not provided
  const trace_id = crypto.randomBytes(16).toString('hex');
  const span_id = crypto.randomBytes(8).toString('hex');
  const traceparent = `00-${trace_id}-${span_id}-01`;

  return {
    traceparent,
    trace_id,
    span_id,
  };
}

interface Location {
  country: string;
  state: string;
  city: string;
  zipCode?: string;
  timezone: string;
}

interface SetupMakerProfileInput {
  userId: string;
  // Business Information
  businessName: string;
  storeDescription: string;
  bio: string;
  displayName?: string;
  businessType: 'INDIVIDUAL' | 'SOLE_PROPRIETORSHIP' | 'LLC' | 'CORPORATION';
  taxId?: string;
  // Location
  location: Location;
  // Media
  profileImageUrl?: string;
  bannerImageUrl?: string;
  // Craft
  primaryCraft: string;
  yearsOfExperience: number;
  // Preferences
  acceptCustomOrders: boolean;
  acceptRushOrders: boolean;
}

interface AppSyncEvent {
  arguments: {
    input: SetupMakerProfileInput;
  };
  identity?: {
    sub?: string;
    claims?: { sub?: string };
  };
}

/**
 * Setup Maker Profile Lambda
 * Called during onboarding to complete maker profile setup
 */
export const handler = async (event: AppSyncEvent): Promise<any> => {
  initTelemetryLogger(event, { domain: "maker-domain", service: "setup-maker-profile" });
  console.log('========== SETUP MAKER PROFILE LAMBDA START ==========');

  // Extract trace context from headers for event propagation
  const traceContext = resolveTraceContext(event);

  if (!MAKER_ENGAGEMENT_FACTS_TABLE_NAME || !MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME) {
    console.error('Table names not configured');
    throw new Error('Internal server error');
  }

  const input = event.arguments?.input;
  if (!input) {
    throw new Error('Missing input');
  }

  const {
    userId: rawUserId,
    businessName,
    storeDescription,
    bio,
    displayName,
    businessType,
    taxId,
    location,
    profileImageUrl,
    bannerImageUrl,
    primaryCraft,
    yearsOfExperience,
    acceptCustomOrders,
    acceptRushOrders,
  } = input;

  // Validate required fields
  const userId = validateId(rawUserId);
  if (!userId || !businessName || !storeDescription || !bio || !businessType || 
      !location || !primaryCraft || yearsOfExperience === undefined) {
    throw new Error('Missing required fields');
  }

  // Validate authorization (user can only update their own profile)
  const requestingUserId = requireAuthenticatedUser(event);
  if (!requestingUserId || requestingUserId !== userId) {
    throw new Error('Unauthorized: Cannot update another user\'s profile');
  }

  // Validate field lengths
  if (businessName.length < 3 || businessName.length > 100) {
    throw new Error('businessName must be 3-100 characters');
  }
  if (storeDescription.length > 2000) {
    throw new Error('storeDescription must be max 2000 characters');
  }
  if (bio.length > 1000) {
    throw new Error('bio must be max 1000 characters');
  }
  if (yearsOfExperience < 0 || yearsOfExperience > 80) {
    throw new Error('yearsOfExperience must be 0-80');
  }

  // Validate location
  if (!location.country || !location.state || !location.city || !location.timezone) {
    throw new Error('Location must include country, state, city, and timezone');
  }

  // Validate timezone format
  const timezone = validateTimezone(location.timezone);
  if (!timezone) {
    throw new Error('Invalid timezone format. Expected format: Region/City (e.g., America/New_York)');
  }

  const now = new Date().toISOString();
  const idempotencyKey = `SETUP_PROFILE#${userId}#${now}`;

  try {
    // Get existing profile to check current version
    const existing = await client.send(
      new GetCommand({
        TableName: MAKER_ENGAGEMENT_FACTS_TABLE_NAME,
        Key: {
          pk: `MAKER#${userId}`,
          sk: 'PROFILE'
        },
      })
    );

    if (!existing.Item) {
      throw new Error('Profile not found. User must register first.');
    }

    const currentVersion = existing.Item.version || 0;
    const newVersion = currentVersion + 1;

    // Prepare updated profile data
    const updatedProfileData = {
      ...existing.Item.data,
      businessName,
      storeDescription,
      bio,
      ...(displayName && { displayName }),
      businessType,
      location,
      primaryCraft,
      yearsOfExperience,
      acceptCustomOrders,
      acceptRushOrders,
      updatedAt: now,
      ...(taxId && { taxId }),
      ...(profileImageUrl && { profileImageUrl }),
      ...(bannerImageUrl && { bannerImageUrl }),
    };

    if ('storeName' in updatedProfileData) {
      delete (updatedProfileData as { storeName?: string }).storeName;
    }

    // Create new fact entry and activity record atomically
    const transactItems = [
      {
        Put: {
          TableName: MAKER_ENGAGEMENT_FACTS_TABLE_NAME,
          Item: {
            pk: `MAKER#${userId}`,
            sk: 'PROFILE',
            data: updatedProfileData,
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
            sk: `ACTIVITY#${idempotencyKey}`,
            data: {
              type: 'PROFILE_SETUP_COMPLETED',
              businessName,
              primaryCraft,
              timestamp: now,
            },
            ttl: Math.floor(Date.now() / 1000) + TTL_POLICIES.ACTIVITY_LONG,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ];

    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

    console.log('Profile setup completed successfully', { userId, businessName });

    // Publish MakerProfileCreated event to EventBridge for discovery domain indexing
    try {
      const eventBridge = new EventBridgeClient({});
      const eventId = crypto.randomUUID();
      await eventBridge.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: EVENT_SOURCE,
              DetailType: 'MakerProfileCreated',
              Detail: JSON.stringify({
                eventId,
                eventType: 'MakerProfileCreated',
                payload: {
                  userId,
                  businessName,
                  primaryCraft,
                  location: {
                    country: location.country,
                    state: location.state,
                    city: location.city,
                  },
                  timestamp: now,
                },
                metadata: {
                  traceparent: traceContext.traceparent,
                  trace_id: traceContext.trace_id,
                  span_id: traceContext.span_id,
                },
              }),
              EventBusName: EVENT_BUS_NAME,
              TraceHeader: traceContext.traceparent,
            },
          ],
        })
      );
      console.log('MakerProfileCreated event published to EventBridge', { userId, eventId, traceContext });
    } catch (eventError) {
      console.error('Failed to publish event to EventBridge, but profile was created successfully', { userId, eventError });
      // Do not throw - profile is created, event publishing is best-effort
    }

    return updatedProfileData;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.error('Profile version conflict or activity already exists', { userId });
      throw new Error('Profile update conflict. Please try again.');
    }
    console.error('Failed to setup profile:', error);
    throw new Error('Failed to setup profile');
  }
};