import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, filterPublicProfileData, validateId } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MAKER_PROFILES_TABLE_NAME = process.env.MAKER_PROFILES_TABLE_NAME;

interface AppSyncEvent {
  arguments?: { userId?: unknown };
  identity?: { sub?: string; claims?: { sub?: string } };
}

/**
 * Get Maker Profile Lambda
 * - Returns authenticated user's own profile (full data)
 */
export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: "maker-domain", service: "get-maker-profile" });

  if (!MAKER_PROFILES_TABLE_NAME) {
    console.error('MAKER_PROFILES_TABLE_NAME not configured');
    throw new Error('Internal server error');
  }

  // Allow any authenticated user (maker or collector) for public profile access
  const authUserId = requireAuthenticatedUser(event, 'both');
  if (!authUserId) {
    throw new Error('Not authenticated');
  }

  const requestedUserId = validateId(event.arguments?.userId);
  const targetUserId = requestedUserId ?? authUserId;

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  try {
    const result = await client.send(
      new GetCommand({
        TableName: MAKER_PROFILES_TABLE_NAME,
        Key: { userId: targetUserId },
      })
    );

    if (!result.Item) {
      return null;
    }

    const profile = { ...result.Item } as Record<string, unknown>;
    
    // Map legacy field names to current schema
    if (profile.businessName == null && typeof profile.storeName === 'string') {
      profile.businessName = profile.storeName;
    }
    if ('storeName' in profile) {
      delete profile.storeName;
    }

    if (requestedUserId) {
      if (profile.publicProfileEnabled === false) {
        throw new Error('Forbidden');
      }
      return filterPublicProfileData(profile);
    }

    return profile;
  } catch (err) {
    console.error('getMakerProfile error:', err);
    throw new Error('Internal server error');
  }
};