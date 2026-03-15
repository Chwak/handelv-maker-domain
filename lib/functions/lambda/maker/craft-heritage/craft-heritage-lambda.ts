import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { encodeNextToken, parseNextToken, requireAuthenticatedUser, validateId, validateLimit } from '../../../../utils/maker-validation';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';

const CRAFT_HERITAGE_TABLE_NAME = process.env.CRAFT_HERITAGE_TABLE_NAME || '';

type MasteryLevel = 'APPRENTICE' | 'JOURNEYMAN' | 'MASTER' | 'GRANDMASTER';

interface TraditionOrigin {
  culture: string;
  region: string;
  centuriesOld: number;
}

interface MasterArtisan {
  name: string;
  relationship: string;
  yearsUnder: number;
}

interface TechniqueDetails {
  name: string;
  description: string;
  toolsRequired: string[];
  difficultyLevel: number;
  timeRequiredPerPiece: number;
  modernAdaptations?: string;
}

interface CertifyingBody {
  name: string;
  certificationDate: string;
  certificationLevel: string;
}

interface MediaDocumentation {
  type: string;
  url: string;
  title: string;
}

interface AddCraftHeritageInput {
  makerUserId?: string;
  craftTradition: string;
  traditionOrigin: TraditionOrigin;
  masteryLevel: MasteryLevel;
  yearsOfPractice: number;
  masterArtisan?: MasterArtisan;
  techniqueDetails: TechniqueDetails;
  certifyingBodyOrGuild?: CertifyingBody;
  apprenticesTrained: number;
  isTeachingOrAcceptingApprentices: boolean;
  mediaDocumentation?: MediaDocumentation[];
  culturalSignificance: string;
  modernInfluences?: string[];
}

interface UpdateCraftHeritageInput extends Partial<AddCraftHeritageInput> {
  heritageId: string;
}

interface AppSyncEvent {
  arguments?: {
    input?: AddCraftHeritageInput | UpdateCraftHeritageInput;
    heritageId?: string;
    limit?: number;
    nextToken?: string;
  };
  identity?: { sub?: string; claims?: { sub?: string } };
  info?: { fieldName?: string };
}

interface CraftHeritageRecord {
  makerUserId: string;
  heritageId: string;
  craftTradition: string;
  traditionOrigin: TraditionOrigin;
  masteryLevel: MasteryLevel;
  yearsOfPractice: number;
  masterArtisan: MasterArtisan | null;
  techniqueDetails: TechniqueDetails;
  certifyingBodyOrGuild: CertifyingBody | null;
  apprenticesTrained: number;
  isTeachingOrAcceptingApprentices: boolean;
  mediaDocumentation: MediaDocumentation[];
  culturalSignificance: string;
  modernInfluences: string[];
  createdAt: string;
  updatedAt: string;
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const MASTERY_LEVELS = new Set<MasteryLevel>(['APPRENTICE', 'JOURNEYMAN', 'MASTER', 'GRANDMASTER']);

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'craft-heritage' });

  if (!CRAFT_HERITAGE_TABLE_NAME) {
    throw new Error('CRAFT_HERITAGE_TABLE_NAME not configured');
  }

  const makerUserId = requireAuthenticatedUser(event, 'maker');
  if (!makerUserId) {
    throw new Error('Not authenticated as maker');
  }

  switch (event.info?.fieldName) {
    case 'listCraftHeritage':
      return listCraftHeritage(makerUserId, event.arguments?.limit, event.arguments?.nextToken);
    case 'getCraftHeritage':
      return getCraftHeritage(makerUserId, event.arguments?.heritageId);
    case 'addCraftHeritage':
      return addCraftHeritage(makerUserId, event.arguments?.input as AddCraftHeritageInput | undefined);
    case 'updateCraftHeritage':
      return updateCraftHeritage(makerUserId, event.arguments?.input as UpdateCraftHeritageInput | undefined);
    case 'deleteCraftHeritage':
      return deleteCraftHeritage(makerUserId, event.arguments?.heritageId);
    default:
      throw new Error('Unsupported operation');
  }
};

async function listCraftHeritage(makerUserId: string, rawLimit?: number, rawNextToken?: string) {
  const limit = validateLimit(rawLimit, 20, 50);
  const exclusiveStartKey = parseNextToken(rawNextToken);

  const result = await client.send(
    new QueryCommand({
      TableName: CRAFT_HERITAGE_TABLE_NAME,
      KeyConditionExpression: 'makerUserId = :makerUserId',
      ExpressionAttributeValues: { ':makerUserId': makerUserId },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  return {
    items: result.Items ?? [],
    nextToken: encodeNextToken(result.LastEvaluatedKey as Record<string, unknown> | null),
  };
}

async function getCraftHeritage(makerUserId: string, rawHeritageId?: string) {
  const heritageId = validateId(rawHeritageId);
  if (!heritageId) {
    throw new Error('Invalid heritageId');
  }

  const result = await client.send(
    new GetCommand({
      TableName: CRAFT_HERITAGE_TABLE_NAME,
      Key: { makerUserId, heritageId },
    })
  );

  return result.Item ?? null;
}

async function addCraftHeritage(makerUserId: string, input?: AddCraftHeritageInput) {
  if (!input) {
    throw new Error('Missing input');
  }

  const heritageId = `heritage-${randomUUID()}`;
  const now = new Date().toISOString();
  const item = normalizeCraftHeritageRecord(makerUserId, heritageId, input, now, now);

  await client.send(
    new PutCommand({
      TableName: CRAFT_HERITAGE_TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

async function updateCraftHeritage(makerUserId: string, input?: UpdateCraftHeritageInput) {
  if (!input) {
    throw new Error('Missing input');
  }

  const heritageId = validateId(input.heritageId);
  if (!heritageId) {
    throw new Error('Invalid heritageId');
  }

  const existing = await getExistingCraftHeritage(makerUserId, heritageId);
  if (!existing) {
    throw new Error('Craft heritage not found');
  }

  const item = normalizeCraftHeritageRecord(
    makerUserId,
    heritageId,
    input,
    existing.createdAt,
    new Date().toISOString(),
    existing
  );

  await client.send(
    new PutCommand({
      TableName: CRAFT_HERITAGE_TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

async function deleteCraftHeritage(makerUserId: string, rawHeritageId?: string) {
  const heritageId = validateId(rawHeritageId);
  if (!heritageId) {
    throw new Error('Invalid heritageId');
  }

  const existing = await getExistingCraftHeritage(makerUserId, heritageId);
  if (!existing) {
    return false;
  }

  await client.send(
    new DeleteCommand({
      TableName: CRAFT_HERITAGE_TABLE_NAME,
      Key: { makerUserId, heritageId },
    })
  );

  return true;
}

async function getExistingCraftHeritage(makerUserId: string, heritageId: string): Promise<CraftHeritageRecord | undefined> {
  const result = await client.send(
    new GetCommand({
      TableName: CRAFT_HERITAGE_TABLE_NAME,
      Key: { makerUserId, heritageId },
    })
  );

  return result.Item as CraftHeritageRecord | undefined;
}

function normalizeCraftHeritageRecord(
  makerUserId: string,
  heritageId: string,
  input: AddCraftHeritageInput | UpdateCraftHeritageInput,
  createdAt: string,
  updatedAt: string,
  existing?: CraftHeritageRecord
): CraftHeritageRecord {
  return {
    makerUserId,
    heritageId,
    craftTradition: normalizeRequiredString(input.craftTradition, existing?.craftTradition, 'craftTradition'),
    traditionOrigin: normalizeTraditionOrigin(input.traditionOrigin, existing?.traditionOrigin),
    masteryLevel: normalizeMasteryLevel(input.masteryLevel, existing?.masteryLevel),
    yearsOfPractice: normalizeNonNegativeInt(input.yearsOfPractice, existing?.yearsOfPractice, 'yearsOfPractice'),
    masterArtisan: normalizeMasterArtisan(input.masterArtisan, existing?.masterArtisan ?? null),
    techniqueDetails: normalizeTechniqueDetails(input.techniqueDetails, existing?.techniqueDetails),
    certifyingBodyOrGuild: normalizeCertifyingBody(input.certifyingBodyOrGuild, existing?.certifyingBodyOrGuild ?? null),
    apprenticesTrained: normalizeNonNegativeInt(input.apprenticesTrained, existing?.apprenticesTrained, 'apprenticesTrained'),
    isTeachingOrAcceptingApprentices: normalizeBoolean(
      input.isTeachingOrAcceptingApprentices,
      existing?.isTeachingOrAcceptingApprentices,
      'isTeachingOrAcceptingApprentices'
    ),
    mediaDocumentation: normalizeMediaDocumentation(input.mediaDocumentation, existing?.mediaDocumentation ?? []),
    culturalSignificance: normalizeRequiredString(
      input.culturalSignificance,
      existing?.culturalSignificance,
      'culturalSignificance'
    ),
    modernInfluences: normalizeStringArray(input.modernInfluences, existing?.modernInfluences ?? []),
    createdAt,
    updatedAt,
  };
}

function normalizeRequiredString(raw: unknown, fallback: string | undefined, fieldName: string): string {
  if (raw == null) {
    if (fallback != null) return fallback;
    throw new Error(`${fieldName} is required`);
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return raw.trim();
}

function normalizeStringArray(raw: unknown, fallback: string[]): string[] {
  if (raw == null) {
    return fallback;
  }
  if (!Array.isArray(raw)) {
    throw new Error('Expected string array');
  }
  return raw.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error('Expected string array');
    }
    return entry.trim();
  });
}

function normalizeNonNegativeInt(raw: unknown, fallback: number | undefined, fieldName: string): number {
  if (raw == null) {
    if (fallback != null) return fallback;
    throw new Error(`${fieldName} is required`);
  }
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return numeric;
}

function normalizeBoolean(raw: unknown, fallback: boolean | undefined, fieldName: string): boolean {
  if (raw == null) {
    if (fallback != null) return fallback;
    throw new Error(`${fieldName} is required`);
  }
  if (typeof raw !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`);
  }
  return raw;
}

function normalizeTraditionOrigin(raw: unknown, fallback?: TraditionOrigin): TraditionOrigin {
  const source = normalizeObject(raw, fallback as Record<string, unknown> | undefined, 'traditionOrigin');
  return {
    culture: normalizeRequiredString(source.culture, fallback?.culture, 'traditionOrigin.culture'),
    region: normalizeRequiredString(source.region, fallback?.region, 'traditionOrigin.region'),
    centuriesOld: normalizeNonNegativeInt(source.centuriesOld, fallback?.centuriesOld, 'traditionOrigin.centuriesOld'),
  };
}

function normalizeMasterArtisan(raw: unknown, fallback: MasterArtisan | null): MasterArtisan | null {
  if (raw == null) {
    return fallback;
  }
  const source = normalizeObject(raw, undefined, 'masterArtisan');
  return {
    name: normalizeRequiredString(source.name, fallback?.name, 'masterArtisan.name'),
    relationship: normalizeRequiredString(source.relationship, fallback?.relationship, 'masterArtisan.relationship'),
    yearsUnder: normalizeNonNegativeInt(source.yearsUnder, fallback?.yearsUnder, 'masterArtisan.yearsUnder'),
  };
}

function normalizeTechniqueDetails(raw: unknown, fallback?: TechniqueDetails): TechniqueDetails {
  const source = normalizeObject(raw, fallback as Record<string, unknown> | undefined, 'techniqueDetails');
  return {
    name: normalizeRequiredString(source.name, fallback?.name, 'techniqueDetails.name'),
    description: normalizeRequiredString(source.description, fallback?.description, 'techniqueDetails.description'),
    toolsRequired: normalizeStringArray(source.toolsRequired, fallback?.toolsRequired ?? []),
    difficultyLevel: normalizeNonNegativeInt(source.difficultyLevel, fallback?.difficultyLevel, 'techniqueDetails.difficultyLevel'),
    timeRequiredPerPiece: normalizeNonNegativeInt(source.timeRequiredPerPiece, fallback?.timeRequiredPerPiece, 'techniqueDetails.timeRequiredPerPiece'),
    modernAdaptations: normalizeOptionalString(source.modernAdaptations, fallback?.modernAdaptations),
  };
}

function normalizeCertifyingBody(raw: unknown, fallback: CertifyingBody | null): CertifyingBody | null {
  if (raw == null) {
    return fallback;
  }
  const source = normalizeObject(raw, undefined, 'certifyingBodyOrGuild');
  return {
    name: normalizeRequiredString(source.name, fallback?.name, 'certifyingBodyOrGuild.name'),
    certificationDate: normalizeDateString(source.certificationDate, fallback?.certificationDate, 'certifyingBodyOrGuild.certificationDate'),
    certificationLevel: normalizeRequiredString(source.certificationLevel, fallback?.certificationLevel, 'certifyingBodyOrGuild.certificationLevel'),
  };
}

function normalizeMediaDocumentation(raw: unknown, fallback: MediaDocumentation[]): MediaDocumentation[] {
  if (raw == null) {
    return fallback;
  }
  if (!Array.isArray(raw)) {
    throw new Error('mediaDocumentation must be an array');
  }
  return raw.map((entry) => {
    const source = normalizeObject(entry, undefined, 'mediaDocumentation');
    return {
      type: normalizeRequiredString(source.type, undefined, 'mediaDocumentation.type'),
      url: normalizeRequiredString(source.url, undefined, 'mediaDocumentation.url'),
      title: normalizeRequiredString(source.title, undefined, 'mediaDocumentation.title'),
    };
  });
}

function normalizeMasteryLevel(raw: unknown, fallback?: MasteryLevel): MasteryLevel {
  if (raw == null) {
    if (fallback) return fallback;
    throw new Error('masteryLevel is required');
  }
  if (typeof raw !== 'string' || !MASTERY_LEVELS.has(raw as MasteryLevel)) {
    throw new Error('Invalid masteryLevel');
  }
  return raw as MasteryLevel;
}

function normalizeOptionalString(raw: unknown, fallback?: string): string | undefined {
  if (raw == null) {
    return fallback;
  }
  if (typeof raw !== 'string') {
    throw new Error('Expected string value');
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDateString(raw: unknown, fallback: string | undefined, fieldName: string): string {
  if (raw == null) {
    if (fallback) return fallback;
    throw new Error(`${fieldName} is required`);
  }
  if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
    throw new Error(`${fieldName} must be a valid date string`);
  }
  return new Date(raw).toISOString();
}

function normalizeObject(raw: unknown, fallback: Record<string, unknown> | undefined, fieldName: string): Record<string, unknown> {
  if (raw == null) {
    if (fallback) return fallback;
    throw new Error(`${fieldName} is required`);
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return raw as Record<string, unknown>;
}