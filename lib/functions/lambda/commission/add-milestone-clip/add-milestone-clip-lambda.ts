import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId, validateLimit, encodeNextToken, parseNextToken } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';

const COMMISSION_PROPOSALS_TABLE_NAME = process.env.COMMISSION_PROPOSALS_TABLE_NAME || '';
const MILESTONE_CLIPS_TABLE_NAME = process.env.MILESTONE_CLIPS_TABLE_NAME || '';
const OUTBOX_TABLE_NAME = process.env.OUTBOX_TABLE_NAME || '';
const EVENT_SOURCE = process.env.EVENT_SOURCE || 'hand-made.maker-domain';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface AddMilestoneClipInput {
  proposalId: string;
  chapter: string;
  note: string;
  mediaKey?: string;
}

interface ListMilestoneClipsArgs {
  proposalId: string;
  limit?: number;
  nextToken?: string;
}

interface AppSyncEvent {
  arguments?: { input?: unknown; proposalId?: unknown; limit?: unknown; nextToken?: unknown };
  identity?: { sub?: string; claims?: { sub?: string } };
  info?: { fieldName?: string };
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'add-milestone-clip' });

  const fieldName = event.info?.fieldName;

  if (fieldName === 'listMilestoneClips') {
    return listMilestoneClips(event);
  }

  // Default: addMilestoneClip mutation
  return addMilestoneClip(event);
};

async function addMilestoneClip(event: AppSyncEvent) {
  if (!COMMISSION_PROPOSALS_TABLE_NAME) throw new Error('COMMISSION_PROPOSALS_TABLE_NAME not configured');
  if (!MILESTONE_CLIPS_TABLE_NAME) throw new Error('MILESTONE_CLIPS_TABLE_NAME not configured');
  if (!OUTBOX_TABLE_NAME) throw new Error('OUTBOX_TABLE_NAME not configured');

  const makerId = requireAuthenticatedUser(event, 'maker');
  if (!makerId) throw new Error('Not authenticated as maker');

  const input = event.arguments?.input as AddMilestoneClipInput | undefined;
  if (!input) throw new Error('Missing input');

  const proposalId = validateId(input.proposalId);
  if (!proposalId) throw new Error('Invalid proposalId');

  const chapter = typeof input.chapter === 'string' ? input.chapter.trim() : '';
  const note = typeof input.note === 'string' ? input.note.trim() : '';

  if (!chapter || !note) throw new Error('chapter and note are required');
  if (chapter.length > 200 || note.length > 3000) throw new Error('Input exceeds maximum allowed length');

  // Verify maker owns this proposal
  const existing = await client.send(
    new GetCommand({ TableName: COMMISSION_PROPOSALS_TABLE_NAME, Key: { proposalId } }),
  );
  if (!existing.Item) throw new Error('Proposal not found');
  if (existing.Item.makerId !== makerId) throw new Error('Forbidden');

  const allowedStatuses = new Set(['IN_CREATION', 'PROPOSAL_PENDING']);
  if (!allowedStatuses.has(existing.Item.status as string)) {
    throw new Error('Cannot add clips to a proposal not currently in creation');
  }

  const clipId = `clip-${randomUUID()}`;
  const now = new Date().toISOString();
  const clipKey = `${now}#${clipId}`;

  const mediaKey =
    typeof input.mediaKey === 'string' && input.mediaKey.trim() ? input.mediaKey.trim() : null;

  const clip = {
    proposalId,
    clipKey,
    clipId,
    makerId,
    chapter,
    note,
    mediaKey,
    createdAt: now,
  };

  const eventId = `evt-${randomUUID()}`;
  const outboxEntry = {
    eventId,
    eventType: 'commission.milestone.clip.added.v1',
    status: 'PENDING',
    source: EVENT_SOURCE,
    createdAt: now,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    payload: JSON.stringify({
      clipId,
      proposalId,
      makerId,
      collectorId: existing.Item.collectorId,
      chapter,
      createdAt: now,
    }),
  };

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: MILESTONE_CLIPS_TABLE_NAME, Item: clip } },
        { Put: { TableName: OUTBOX_TABLE_NAME, Item: outboxEntry } },
      ],
    }),
  );

  console.log('Milestone clip added', { clipId, proposalId });
  return clip;
}

async function listMilestoneClips(event: AppSyncEvent) {
  if (!MILESTONE_CLIPS_TABLE_NAME) throw new Error('MILESTONE_CLIPS_TABLE_NAME not configured');

  const callerId = requireAuthenticatedUser(event, 'both');
  if (!callerId) throw new Error('Not authenticated');

  const proposalId = validateId(event.arguments?.proposalId);
  if (!proposalId) throw new Error('Invalid proposalId');

  // Verify caller is involved in this proposal
  const proposalCheck = await client.send(
    new GetCommand({ TableName: COMMISSION_PROPOSALS_TABLE_NAME, Key: { proposalId } }),
  );
  if (!proposalCheck.Item) throw new Error('Proposal not found');
  if (proposalCheck.Item.makerId !== callerId && proposalCheck.Item.collectorId !== callerId) {
    throw new Error('Forbidden');
  }

  const limit = validateLimit(event.arguments?.limit, 20, 50);
  const exclusiveStartKey = parseNextToken(event.arguments?.nextToken);

  const result = await client.send(
    new QueryCommand({
      TableName: MILESTONE_CLIPS_TABLE_NAME,
      KeyConditionExpression: 'proposalId = :proposalId',
      ExpressionAttributeValues: { ':proposalId': proposalId },
      Limit: limit,
      ScanIndexForward: false,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  return {
    items: result.Items ?? [],
    nextToken: encodeNextToken(result.LastEvaluatedKey as Record<string, unknown> | null),
  };
}
