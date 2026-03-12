import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';

const COMMISSION_PROPOSALS_TABLE_NAME = process.env.COMMISSION_PROPOSALS_TABLE_NAME || '';
const OUTBOX_TABLE_NAME = process.env.OUTBOX_TABLE_NAME || '';
const EVENT_SOURCE = process.env.EVENT_SOURCE || 'hand-made.maker-domain';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type ProposalAction = 'ACCEPT' | 'DECLINE' | 'REQUEST_REFINEMENT' | 'MARK_READY';

const VALID_TRANSITIONS: Record<string, ProposalAction[]> = {
  PROPOSAL_PENDING: ['ACCEPT', 'DECLINE', 'REQUEST_REFINEMENT'],
  REFINEMENT_REQUESTED: ['ACCEPT', 'DECLINE'],
  IN_CREATION: ['DECLINE', 'MARK_READY'],
};

const ACTION_TO_STATUS: Record<ProposalAction, string> = {
  ACCEPT: 'IN_CREATION',
  DECLINE: 'DECLINED',
  REQUEST_REFINEMENT: 'REFINEMENT_REQUESTED',
  MARK_READY: 'READY_FOR_SHELF',
};

const ACTION_TO_EVENT: Record<ProposalAction, string> = {
  ACCEPT: 'commission.proposal.accepted.v1',
  DECLINE: 'commission.proposal.declined.v1',
  REQUEST_REFINEMENT: 'commission.proposal.refinement_requested.v1',
  MARK_READY: 'commission.proposal.ready_for_shelf.v1',
};

interface UpdateProposalStatusInput {
  proposalId: string;
  action: ProposalAction;
  declineReason?: string;
  refinementNote?: string;
  productId?: string;
}

interface AppSyncEvent {
  arguments?: { input?: unknown };
  identity?: { sub?: string; claims?: { sub?: string } };
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'update-proposal-status' });

  if (!COMMISSION_PROPOSALS_TABLE_NAME) throw new Error('COMMISSION_PROPOSALS_TABLE_NAME not configured');
  if (!OUTBOX_TABLE_NAME) throw new Error('OUTBOX_TABLE_NAME not configured');

  const makerId = requireAuthenticatedUser(event, 'maker');
  if (!makerId) throw new Error('Not authenticated as maker');

  const input = event.arguments?.input as UpdateProposalStatusInput | undefined;
  if (!input) throw new Error('Missing input');

  const proposalId = validateId(input.proposalId);
  if (!proposalId) throw new Error('Invalid proposalId');

  const action = input.action as ProposalAction;
  if (!['ACCEPT', 'DECLINE', 'REQUEST_REFINEMENT', 'MARK_READY'].includes(action)) {
    throw new Error('Invalid action');
  }

  // Fetch and validate ownership
  const existing = await client.send(
    new GetCommand({ TableName: COMMISSION_PROPOSALS_TABLE_NAME, Key: { proposalId } }),
  );
  if (!existing.Item) throw new Error('Proposal not found');

  const proposal = existing.Item as Record<string, unknown>;
  if (proposal.makerId !== makerId) throw new Error('Forbidden');

  const currentStatus = proposal.status as string;
  const allowedActions = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowedActions.includes(action)) {
    throw new Error(`Action ${action} is not allowed from status ${currentStatus}`);
  }

  const newStatus = ACTION_TO_STATUS[action];
  const now = new Date().toISOString();

  const updateAttrs: Record<string, unknown> = {
    ':status': newStatus,
    ':updatedAt': now,
  };
  const setExprs = ['#status = :status', 'updatedAt = :updatedAt'];

  if (action === 'ACCEPT') {
    setExprs.push('acceptedAt = :acceptedAt');
    updateAttrs[':acceptedAt'] = now;
  }

  if (action === 'MARK_READY') {
    const productId = typeof input.productId === 'string' ? input.productId.trim() : '';
    if (!productId) throw new Error('productId is required when action is MARK_READY');
    setExprs.push('productId = :productId', 'completedAt = :completedAt');
    updateAttrs[':productId'] = productId;
    updateAttrs[':completedAt'] = now;
  }

  if (
    action === 'DECLINE' &&
    typeof input.declineReason === 'string' &&
    input.declineReason.trim()
  ) {
    const sanitized = input.declineReason.trim().slice(0, 1000);
    setExprs.push('declineReason = :declineReason');
    updateAttrs[':declineReason'] = sanitized;
  }

  if (
    action === 'REQUEST_REFINEMENT' &&
    typeof input.refinementNote === 'string' &&
    input.refinementNote.trim()
  ) {
    const sanitized = input.refinementNote.trim().slice(0, 2000);
    setExprs.push('refinementNote = :refinementNote');
    updateAttrs[':refinementNote'] = sanitized;
  }

  const eventId = `evt-${randomUUID()}`;
  const outboxEntry = {
    eventId,
    eventType: ACTION_TO_EVENT[action],
    status: 'PENDING',
    source: EVENT_SOURCE,
    createdAt: now,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    payload: JSON.stringify({
      proposalId,
      makerId,
      collectorId: proposal.collectorId,
      action,
      newStatus,
      updatedAt: now,
      declineReason: action === 'DECLINE' ? (input.declineReason ?? null) : null,
      refinementNote: action === 'REQUEST_REFINEMENT' ? (input.refinementNote ?? null) : null,
      productId: action === 'MARK_READY' ? (input.productId ?? null) : null,
    }),
  };

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: COMMISSION_PROPOSALS_TABLE_NAME,
            Key: { proposalId },
            UpdateExpression: `SET ${setExprs.join(', ')}`,
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: updateAttrs,
            ConditionExpression: 'attribute_exists(proposalId)',
          },
        },
        { Put: { TableName: OUTBOX_TABLE_NAME, Item: outboxEntry } },
      ],
    }),
  );

  console.log('Proposal status updated', { proposalId, action, newStatus });
  return { ...proposal, status: newStatus, updatedAt: now };
};
