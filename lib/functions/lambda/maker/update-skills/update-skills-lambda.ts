import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MAKER_PROFILES_TABLE_NAME = process.env.MAKER_PROFILES_TABLE_NAME;

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
  if (!MAKER_PROFILES_TABLE_NAME) {
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
      TableName: MAKER_PROFILES_TABLE_NAME,
      Key: { userId },
    })
  );
  if (!getResult.Item) throw new Error('Maker profile not found');

  const now = new Date().toISOString();

  const updatedData = { ...(getResult.Item as Record<string, unknown>) };
  updatedData.skills = skills;
  updatedData.updatedAt = now;

  try {
    await client.send(
      new PutCommand({
        TableName: MAKER_PROFILES_TABLE_NAME,
        Item: updatedData,
        ConditionExpression: 'attribute_exists(userId)',
      })
    );

    return updatedData;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.error('Maker profile disappeared during skills update', { userId });
      throw new Error('Maker profile not found');
    }
    console.error('Failed to update skills:', error);
    throw new Error('Failed to update skills');
  }
};