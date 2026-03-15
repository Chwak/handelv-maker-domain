import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MAKER_PROFILES_TABLE_NAME = process.env.MAKER_PROFILES_TABLE_NAME;

export const handler = async (event: { identity?: { sub?: string; claims?: { sub?: string } } }) => {
  initTelemetryLogger(event, { domain: "maker-domain", service: "get-verification-status" });
  if (!MAKER_PROFILES_TABLE_NAME) throw new Error('Internal server error');

  const userId = requireAuthenticatedUser(event);
  if (!userId) throw new Error('Not authenticated');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const result = await client.send(
    new GetCommand({
      TableName: MAKER_PROFILES_TABLE_NAME,
      Key: { userId },
    })
  );

  const profile = result.Item as Record<string, unknown> | undefined;
  const now = new Date().toISOString();

  const overallStatus = (profile?.identityVerificationStatus as string | undefined) ?? 'UNVERIFIED';
  return {
    makerUserId: userId,
    identityVerified: (profile?.identityVerified as boolean | undefined) ?? false,
    businessVerified: (profile?.businessVerified as boolean | undefined) ?? false,
    proofOfCraftVerified: (profile?.proofOfCraftVerified as boolean | undefined) ?? false,
    overallStatus,
    lastUpdated: (profile?.updatedAt as string | undefined) ?? (profile?.createdAt as string | undefined) ?? now,
  };
};