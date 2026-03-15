import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { initTelemetryLogger } from '../../../../utils/telemetry-logger';
import { requireAuthenticatedUser } from '../../../../utils/maker-validation';

const MAKER_OPERATIONS_TABLE_NAME = process.env.MAKER_OPERATIONS_TABLE_NAME || '';

type Workload = 'LIGHT' | 'MODERATE' | 'HEAVY' | 'AT_CAPACITY';

interface HoursPerDay {
  mon?: number;
  tue?: number;
  wed?: number;
  thu?: number;
  fri?: number;
  sat?: number;
  sun?: number;
}

interface RecurringClosure {
  dayOfWeek: number;
  reason: string;
}

interface OperationsInput {
  makerUserId?: string;
  weekDate?: string;
  workingDaysThisWeek?: number[];
  hoursPerDay?: HoursPerDay;
  vacationMode?: boolean;
  vacationStartDate?: string;
  vacationEndDate?: string;
  currentWorkload?: Workload;
  acceptingCustomOrders?: boolean;
  acceptingRushOrders?: boolean;
  recurringClosures?: RecurringClosure[];
  peakSeasonIndicator?: boolean;
}

interface AppSyncEvent {
  arguments?: { input?: OperationsInput; weekDate?: string };
  identity?: { sub?: string; claims?: { sub?: string } };
  info?: { fieldName?: string };
}

interface OperationsRecord {
  makerUserId: string;
  weekDate: string;
  workingDaysThisWeek: number[];
  hoursPerDay: HoursPerDay;
  vacationMode: boolean;
  vacationStartDate: string | null;
  vacationEndDate: string | null;
  currentWorkload: Workload;
  nextAvailableSlot: string | null;
  acceptingCustomOrders: boolean;
  acceptingRushOrders: boolean;
  recurringClosures: RecurringClosure[];
  peakSeasonIndicator: boolean;
  createdAt: string;
  updatedAt: string;
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const WORKLOADS = new Set<Workload>(['LIGHT', 'MODERATE', 'HEAVY', 'AT_CAPACITY']);
const DAY_KEYS: Array<keyof HoursPerDay> = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: 'maker-domain', service: 'maker-operations' });

  if (!MAKER_OPERATIONS_TABLE_NAME) {
    throw new Error('MAKER_OPERATIONS_TABLE_NAME not configured');
  }

  const makerUserId = requireAuthenticatedUser(event, 'maker');
  if (!makerUserId) {
    throw new Error('Not authenticated as maker');
  }

  switch (event.info?.fieldName) {
    case 'getOperations':
      return getOperations(makerUserId, event.arguments?.weekDate);
    case 'getCurrentOperations':
      return getOperations(makerUserId, currentWeekDate());
    case 'setupOperations':
      return setupOperations(makerUserId, event.arguments?.input);
    case 'updateOperations':
      return updateOperations(makerUserId, event.arguments?.input);
    case 'setVacationMode':
      return setVacationMode(makerUserId, event.arguments?.input);
    default:
      throw new Error('Unsupported operation');
  }
};

async function getOperations(makerUserId: string, rawWeekDate?: string) {
  const weekDate = normalizeWeekDate(rawWeekDate);
  if (!weekDate) {
    throw new Error('Invalid weekDate');
  }

  const result = await client.send(
    new GetCommand({
      TableName: MAKER_OPERATIONS_TABLE_NAME,
      Key: { makerUserId, weekDate },
    })
  );

  return result.Item ?? null;
}

async function setupOperations(makerUserId: string, input?: OperationsInput) {
  if (!input) {
    throw new Error('Missing input');
  }

  const now = new Date().toISOString();
  const weekDate = normalizeWeekDate(input.weekDate);
  if (!weekDate) {
    throw new Error('Invalid weekDate');
  }

  const item = createOperationsRecord(makerUserId, weekDate, input, now, now, undefined, true);
  await putOperations(item);
  return item;
}

async function updateOperations(makerUserId: string, input?: OperationsInput) {
  if (!input) {
    throw new Error('Missing input');
  }

  const weekDate = normalizeWeekDate(input.weekDate);
  if (!weekDate) {
    throw new Error('Invalid weekDate');
  }

  const existing = await getExistingOperations(makerUserId, weekDate);
  const now = new Date().toISOString();
  const item = createOperationsRecord(
    makerUserId,
    weekDate,
    input,
    existing?.createdAt ?? now,
    now,
    existing,
    false
  );

  await putOperations(item);
  return item;
}

async function setVacationMode(makerUserId: string, input?: OperationsInput) {
  if (!input) {
    throw new Error('Missing input');
  }

  const weekDate = normalizeWeekDate(input.weekDate);
  if (!weekDate) {
    throw new Error('Invalid weekDate');
  }

  if (typeof input.vacationMode !== 'boolean') {
    throw new Error('vacationMode is required');
  }

  const existing = await getExistingOperations(makerUserId, weekDate);
  const now = new Date().toISOString();
  const item = createOperationsRecord(
    makerUserId,
    weekDate,
    {
      vacationMode: input.vacationMode,
      vacationStartDate: input.vacationStartDate,
      vacationEndDate: input.vacationEndDate,
    },
    existing?.createdAt ?? now,
    now,
    existing,
    false
  );

  await putOperations(item);
  return item;
}

async function getExistingOperations(makerUserId: string, weekDate: string): Promise<OperationsRecord | undefined> {
  const result = await client.send(
    new GetCommand({
      TableName: MAKER_OPERATIONS_TABLE_NAME,
      Key: { makerUserId, weekDate },
    })
  );

  return result.Item as OperationsRecord | undefined;
}

async function putOperations(item: OperationsRecord) {
  await client.send(
    new PutCommand({
      TableName: MAKER_OPERATIONS_TABLE_NAME,
      Item: item,
    })
  );
}

function createOperationsRecord(
  makerUserId: string,
  weekDate: string,
  input: OperationsInput,
  createdAt: string,
  updatedAt: string,
  existing?: OperationsRecord,
  requireFullInput = false
): OperationsRecord {
  const base = existing ?? defaultOperationsRecord(makerUserId, weekDate, createdAt);

  const workingDaysThisWeek = normalizeWorkingDays(
    input.workingDaysThisWeek,
    requireFullInput ? 'workingDaysThisWeek is required' : undefined,
    base.workingDaysThisWeek
  );
  const hoursPerDay = normalizeHoursPerDay(
    input.hoursPerDay,
    requireFullInput ? 'hoursPerDay is required' : undefined,
    base.hoursPerDay
  );
  const currentWorkload = normalizeWorkload(
    input.currentWorkload,
    requireFullInput ? 'currentWorkload is required' : undefined,
    base.currentWorkload
  );
  const acceptingCustomOrders = normalizeBoolean(
    input.acceptingCustomOrders,
    requireFullInput ? 'acceptingCustomOrders is required' : undefined,
    base.acceptingCustomOrders
  );
  const acceptingRushOrders = normalizeBoolean(
    input.acceptingRushOrders,
    requireFullInput ? 'acceptingRushOrders is required' : undefined,
    base.acceptingRushOrders
  );
  const vacationMode = normalizeBoolean(input.vacationMode, undefined, base.vacationMode);
  const vacationStartDate = normalizeOptionalDate(input.vacationStartDate, base.vacationStartDate);
  const vacationEndDate = normalizeOptionalDate(input.vacationEndDate, base.vacationEndDate);

  if (vacationMode && (!vacationStartDate || !vacationEndDate)) {
    throw new Error('Vacation mode requires start and end dates');
  }

  return {
    makerUserId,
    weekDate,
    workingDaysThisWeek,
    hoursPerDay,
    vacationMode,
    vacationStartDate: vacationMode ? vacationStartDate : null,
    vacationEndDate: vacationMode ? vacationEndDate : null,
    currentWorkload,
    nextAvailableSlot: vacationMode ? vacationEndDate : null,
    acceptingCustomOrders,
    acceptingRushOrders,
    recurringClosures: normalizeRecurringClosures(input.recurringClosures, base.recurringClosures),
    peakSeasonIndicator: normalizeBoolean(input.peakSeasonIndicator, undefined, base.peakSeasonIndicator),
    createdAt,
    updatedAt,
  };
}

function defaultOperationsRecord(makerUserId: string, weekDate: string, timestamp: string): OperationsRecord {
  return {
    makerUserId,
    weekDate,
    workingDaysThisWeek: [],
    hoursPerDay: {},
    vacationMode: false,
    vacationStartDate: null,
    vacationEndDate: null,
    currentWorkload: 'MODERATE',
    nextAvailableSlot: null,
    acceptingCustomOrders: false,
    acceptingRushOrders: false,
    recurringClosures: [],
    peakSeasonIndicator: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeWeekDate(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeWorkingDays(raw: unknown, requiredMessage?: string, fallback: number[] = []): number[] {
  if (raw == null) {
    if (requiredMessage) throw new Error(requiredMessage);
    return fallback;
  }
  if (!Array.isArray(raw)) {
    throw new Error('workingDaysThisWeek must be an array');
  }

  const values = Array.from(new Set(raw.map((value) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 6) {
      throw new Error('workingDaysThisWeek must contain values between 0 and 6');
    }
    return numeric;
  })));

  values.sort((left, right) => left - right);
  return values;
}

function normalizeHoursPerDay(raw: unknown, requiredMessage?: string, fallback: HoursPerDay = {}): HoursPerDay {
  if (raw == null) {
    if (requiredMessage) throw new Error(requiredMessage);
    return fallback;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('hoursPerDay must be an object');
  }

  const record = raw as Record<string, unknown>;
  const result: HoursPerDay = {};
  for (const key of DAY_KEYS) {
    const value = record[key];
    if (value == null || value === '') {
      continue;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 24) {
      throw new Error(`hoursPerDay.${key} must be between 0 and 24`);
    }
    result[key] = numeric;
  }
  return result;
}

function normalizeWorkload(raw: unknown, requiredMessage: string | undefined, fallback: Workload): Workload {
  if (raw == null) {
    if (requiredMessage) throw new Error(requiredMessage);
    return fallback;
  }
  if (typeof raw !== 'string' || !WORKLOADS.has(raw as Workload)) {
    throw new Error('Invalid currentWorkload');
  }
  return raw as Workload;
}

function normalizeBoolean(raw: unknown, requiredMessage?: string, fallback = false): boolean {
  if (raw == null) {
    if (requiredMessage) throw new Error(requiredMessage);
    return fallback;
  }
  if (typeof raw !== 'boolean') {
    throw new Error('Expected boolean value');
  }
  return raw;
}

function normalizeOptionalDate(raw: unknown, fallback: string | null): string | null {
  if (raw == null || raw === '') {
    return fallback;
  }
  if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
    throw new Error('Invalid date value');
  }
  return new Date(raw).toISOString();
}

function normalizeRecurringClosures(raw: unknown, fallback: RecurringClosure[]): RecurringClosure[] {
  if (raw == null) {
    return fallback;
  }
  if (!Array.isArray(raw)) {
    throw new Error('recurringClosures must be an array');
  }

  return raw.map((value) => {
    if (typeof value !== 'object' || value == null || Array.isArray(value)) {
      throw new Error('Invalid recurring closure');
    }
    const entry = value as Record<string, unknown>;
    const dayOfWeek = typeof entry.dayOfWeek === 'number' ? entry.dayOfWeek : Number(entry.dayOfWeek);
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !reason) {
      throw new Error('Invalid recurring closure');
    }
    return { dayOfWeek, reason };
  });
}

function currentWeekDate(): string {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = monday.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}