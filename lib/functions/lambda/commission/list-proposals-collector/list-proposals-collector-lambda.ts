import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateLimit, encodeNextToken, parseNextToken } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';

const COMMISSION_PROPOSALS_TABLE_NAME = process.env.COMMISSION_PROPOSALS_TABLE_NAME || '';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface AppSyncEvent {
  arguments?: { limit?: unknown; nextToken?: unknown };
  identity?: { sub?: string; claims?: { sub?: string } };
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'list-proposals-collector' });

  if (!COMMISSION_PROPOSALS_TABLE_NAME) throw new Error('COMMISSION_PROPOSALS_TABLE_NAME not configured');

  const collectorId = requireAuthenticatedUser(event, 'collector');
  if (!collectorId) throw new Error('Not authenticated as collector');

  const limit = validateLimit(event.arguments?.limit, 20, 50);
  const exclusiveStartKey = parseNextToken(event.arguments?.nextToken);

  const result = await client.send(
    new QueryCommand({
      TableName: COMMISSION_PROPOSALS_TABLE_NAME,
      IndexName: 'GSI2-CollectorId-CreatedAt',
      KeyConditionExpression: 'collectorId = :collectorId',
      ExpressionAttributeValues: { ':collectorId': collectorId },
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
