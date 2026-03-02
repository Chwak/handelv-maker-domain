import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MAKER_ENGAGEMENT_FACTS_TABLE_NAME = process.env.MAKER_ENGAGEMENT_FACTS_TABLE_NAME;

export const handler = async (event: { arguments?: { makerUserId?: unknown }; identity?: { sub?: string; claims?: { sub?: string } } }) => {
  initTelemetryLogger(event, { domain: "maker-domain", service: "get-verification-status" });
  if (!MAKER_ENGAGEMENT_FACTS_TABLE_NAME) throw new Error('Internal server error');

  const makerUserId = validateId(event.arguments?.makerUserId);
  if (!makerUserId) throw new Error('Invalid input format');

  const userId = requireAuthenticatedUser(event);
  if (!userId) throw new Error('Not authenticated');
  if (userId !== makerUserId) {
    throw new Error('Forbidden');
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const result = await client.send(
    new GetCommand({
      TableName: MAKER_ENGAGEMENT_FACTS_TABLE_NAME,
      Key: {
        pk: `MAKER#${makerUserId}`,
        sk: 'PROFILE'
      },
    })
  );

  const profile = result.Item?.data as Record<string, unknown> | undefined;
  if (!profile) throw new Error('Maker profile not found');

  const overallStatus = (profile.identityVerificationStatus as string) ?? 'PENDING';
  return {
    makerUserId,
    identityVerified: (profile.identityVerified as boolean) ?? false,
    businessVerified: (profile.businessVerified as boolean) ?? false,
    proofOfCraftVerified: (profile.proofOfCraftVerified as boolean) ?? false,
    overallStatus,
    lastUpdated: (profile.updatedAt as string) ?? (profile.createdAt as string) ?? new Date().toISOString(),
  };
};