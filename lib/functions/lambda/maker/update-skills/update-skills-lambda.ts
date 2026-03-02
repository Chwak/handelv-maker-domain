import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { TTL_POLICIES } from '../../../../utils/maker-constants';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MAKER_ENGAGEMENT_FACTS_TABLE_NAME = process.env.MAKER_ENGAGEMENT_FACTS_TABLE_NAME;
const MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME = process.env.MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME;

interface UpdateSkillsInput {
  userId?: unknown;
  skills?: unknown[];
}

function validateSkillsArray(v: unknown, maxItems: number): string[] | null {
  if (v == null || !Array.isArray(v)) return null;
  const arr = v.filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter(Boolean);
  if (arr.length > maxItems) return null;
  return arr;
}

export const handler = async (event: {
  arguments?: { input?: UpdateSkillsInput };
  identity?: { sub?: string; claims?: { sub?: string } };
}) => {
  initTelemetryLogger(event, { domain: "maker-domain", service: "update-skills" });
  if (!MAKER_ENGAGEMENT_FACTS_TABLE_NAME || !MAKER_ENGAGEMENT_ACTIVITY_TABLE_NAME) {
    throw new Error('Internal server error');
  }

  const input = event.arguments?.input ?? {};
  const userId = validateId(input.userId);
  const skills = validateSkillsArray(input.skills, 50);
  if (!userId || !skills) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth || auth !== userId) throw new Error('Forbidden');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  // Get existing profile
  const getResult = await client.send(
    new GetCommand({
      TableName: MAKER_ENGAGEMENT_FACTS_TABLE_NAME,
      Key: {
        pk: `MAKER#${userId}`,
        sk: 'PROFILE'
      },
    })
  );
  if (!getResult.Item) throw new Error('Maker profile not found');

  const now = new Date().toISOString();
  const currentVersion = getResult.Item.version || 0;
  const newVersion = currentVersion + 1;
  const idempotencyKey = `UPDATE_SKILLS#${userId}#${now}`;

  // Update skills in existing data
  const updatedData = { ...getResult.Item.data };
  updatedData.skills = skills;
  updatedData.updatedAt = now;

  try {
    // Atomically create new fact and activity record
    const transactItems = [
      {
        Put: {
          TableName: MAKER_ENGAGEMENT_FACTS_TABLE_NAME,
          Item: {
            pk: `MAKER#${userId}`,
            sk: 'PROFILE',
            data: updatedData,
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
              type: 'SKILLS_UPDATED',
              skills,
              timestamp: now,
            },
            ttl: Math.floor(Date.now() / 1000) + TTL_POLICIES.ACTIVITY_MEDIUM,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ];

    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return updatedData;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.error('Profile version conflict or activity already exists', { userId });
      throw new Error('Skills update conflict. Please try again.');
    }
    console.error('Failed to update skills:', error);
    throw new Error('Failed to update skills');
  }
};