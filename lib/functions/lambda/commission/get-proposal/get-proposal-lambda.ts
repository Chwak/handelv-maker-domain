import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';

const COMMISSION_PROPOSALS_TABLE_NAME = process.env.COMMISSION_PROPOSALS_TABLE_NAME || '';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface AppSyncEvent {
  arguments?: { proposalId?: unknown };
  identity?: { sub?: string; claims?: { sub?: string } };
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'get-proposal' });

  if (!COMMISSION_PROPOSALS_TABLE_NAME) throw new Error('COMMISSION_PROPOSALS_TABLE_NAME not configured');

  const callerId = requireAuthenticatedUser(event, 'both');
  if (!callerId) throw new Error('Not authenticated');

  const proposalId = validateId(event.arguments?.proposalId);
  if (!proposalId) throw new Error('Invalid proposalId');

  const result = await client.send(
    new GetCommand({
      TableName: COMMISSION_PROPOSALS_TABLE_NAME,
      Key: { proposalId },
    }),
  );

  if (!result.Item) return null;

  const proposal = result.Item as Record<string, unknown>;

  // Only the involved maker or collector may read this proposal
  if (proposal.makerId !== callerId && proposal.collectorId !== callerId) {
    throw new Error('Forbidden');
  }

  return proposal;
};
