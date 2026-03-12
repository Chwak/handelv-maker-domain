import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';

const COMMISSION_PROPOSALS_TABLE_NAME = process.env.COMMISSION_PROPOSALS_TABLE_NAME || '';
const OUTBOX_TABLE_NAME = process.env.OUTBOX_TABLE_NAME || '';
const EVENT_SOURCE = process.env.EVENT_SOURCE || 'hand-made.maker-domain';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface SubmitProposalInput {
  makerId: string;
  desiredMaterial: string;
  story: string;
  dimensions: string;
  moodImageKey?: string;
  collectorDisplayName?: string;
}

interface AppSyncEvent {
  arguments?: { input?: unknown };
  identity?: { sub?: string; claims?: { sub?: string; name?: string; given_name?: string } };
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'submit-proposal' });

  if (!COMMISSION_PROPOSALS_TABLE_NAME) throw new Error('COMMISSION_PROPOSALS_TABLE_NAME not configured');
  if (!OUTBOX_TABLE_NAME) throw new Error('OUTBOX_TABLE_NAME not configured');

  const collectorId = requireAuthenticatedUser(event, 'collector');
  if (!collectorId) throw new Error('Not authenticated as collector');

  const input = event.arguments?.input as SubmitProposalInput | undefined;
  if (!input) throw new Error('Missing input');

  const makerId = validateId(input.makerId);
  if (!makerId) throw new Error('Invalid makerId');

  const desiredMaterial = typeof input.desiredMaterial === 'string' ? input.desiredMaterial.trim() : '';
  const story = typeof input.story === 'string' ? input.story.trim() : '';
  const dimensions = typeof input.dimensions === 'string' ? input.dimensions.trim() : '';

  if (!desiredMaterial || !story || !dimensions) {
    throw new Error('desiredMaterial, story, and dimensions are required');
  }

  if (desiredMaterial.length > 500 || story.length > 5000 || dimensions.length > 500) {
    throw new Error('Input exceeds maximum allowed length');
  }

  const proposalId = `proposal-${randomUUID()}`;
  const now = new Date().toISOString();
  const claims = (event.identity as { claims?: Record<string, unknown> })?.claims ?? {};
  const collectorDisplayName =
    typeof input.collectorDisplayName === 'string'
      ? input.collectorDisplayName.trim()
      : (typeof claims.name === 'string' ? claims.name.trim() : null);

  const moodImageKey =
    typeof input.moodImageKey === 'string' && input.moodImageKey.trim()
      ? input.moodImageKey.trim()
      : null;

  const proposal = {
    proposalId,
    makerId,
    collectorId,
    collectorDisplayName,
    status: 'PROPOSAL_PENDING',
    desiredMaterial,
    story,
    dimensions,
    moodImageKey,
    declineReason: null,
    refinementNote: null,
    passportSealEnabled: false,
    createdAt: now,
    updatedAt: now,
    acceptedAt: null,
    completedAt: null,
  };

  const eventId = `evt-${randomUUID()}`;
  const outboxEntry = {
    eventId,
    eventType: 'commission.proposal.submitted.v1',
    status: 'PENDING',
    source: EVENT_SOURCE,
    createdAt: now,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    payload: JSON.stringify({
      proposalId,
      makerId,
      collectorId,
      collectorDisplayName,
      desiredMaterial,
      submittedAt: now,
    }),
  };

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: COMMISSION_PROPOSALS_TABLE_NAME, Item: proposal } },
        { Put: { TableName: OUTBOX_TABLE_NAME, Item: outboxEntry } },
      ],
    }),
  );

  console.log('Commission proposal submitted', { proposalId, makerId, collectorId });
  return proposal;
};
