import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateLimit, encodeNextToken, parseNextToken } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';

const COMMISSION_PROPOSALS_TABLE_NAME = process.env.COMMISSION_PROPOSALS_TABLE_NAME || '';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ALLOWED_STATUSES = new Set([
  'PROPOSAL_PENDING',
  'IN_CREATION',
  'READY_FOR_SHELF',
  'DECLINED',
  'FULFILLED',
]);

interface AppSyncEvent {
  arguments?: { status?: unknown; limit?: unknown; nextToken?: unknown };
  identity?: { sub?: string; claims?: { sub?: string } };
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'list-proposals-maker' });

  if (!COMMISSION_PROPOSALS_TABLE_NAME) throw new Error('COMMISSION_PROPOSALS_TABLE_NAME not configured');

  const makerId = requireAuthenticatedUser(event, 'maker');
  if (!makerId) throw new Error('Not authenticated as maker');

  const rawStatus = event.arguments?.status;
  const statusFilter =
    typeof rawStatus === 'string' && ALLOWED_STATUSES.has(rawStatus) ? rawStatus : null;

  const limit = validateLimit(event.arguments?.limit, 20, 50);
  const exclusiveStartKey = parseNextToken(event.arguments?.nextToken);

  const result = await client.send(
    new QueryCommand({
      TableName: COMMISSION_PROPOSALS_TABLE_NAME,
      IndexName: 'GSI1-MakerId-Status',
      KeyConditionExpression: 'makerId = :makerId',
      FilterExpression: statusFilter ? '#status = :status' : undefined,
      ExpressionAttributeNames: statusFilter ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: {
        ':makerId': makerId,
        ...(statusFilter ? { ':status': statusFilter } : {}),
      },
      Limit: limit,
      ScanIndexForward: false,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  return {
    items: result.Items ?? [],
    nextToken: encodeNextToken(result.LastEvaluatedKey as Record<string, unknown> | null),
  };
};
