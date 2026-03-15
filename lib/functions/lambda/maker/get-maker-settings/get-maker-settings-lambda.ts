import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";
import {
  requireAuthenticatedUser,
} from '../../../../utils/maker-validation';

const MAKER_SETTINGS_TABLE_NAME = process.env.MAKER_SETTINGS_TABLE_NAME;

interface AppSyncEvent {
  identity?: any;
}

function buildDefaultSettings(userId: string) {
  const now = new Date().toISOString();
  return {
    userId,
    notifications: {
      newOrder: true,
      orderCancellation: true,
      orderDispute: true,
      newReview: true,
      newFollower: true,
      newMessage: true,
      lowInventory: true,
      dailySalesSummary: false,
      weeklySalesSummary: true,
      monthlySalesSummary: false,
      platformPromotions: false,
      tipsAndBestPractices: true,
      accountSecurity: true,
      policyUpdates: true,
      payoutNotifications: true,
    },
    notificationChannels: {
      newOrder: { email: true, push: true, sms: false },
      orderCancellation: { email: true, push: true, sms: false },
      orderDispute: { email: true, push: true, sms: false },
      newReview: { email: true, push: true, sms: false },
      newFollower: { email: true, push: true, sms: false },
      newMessage: { email: true, push: true, sms: false },
      lowInventory: { email: true, push: true, sms: false },
      dailySalesSummary: { email: true, push: false, sms: false },
      weeklySalesSummary: { email: true, push: false, sms: false },
      monthlySalesSummary: { email: true, push: false, sms: false },
      platformPromotions: { email: true, push: false, sms: false },
      tipsAndBestPractices: { email: true, push: false, sms: false },
      accountSecurity: { email: true, push: true, sms: false },
      policyUpdates: { email: true, push: true, sms: false },
      payoutNotifications: { email: true, push: true, sms: false },
    },
    shop: {
      isOnVacationMode: false,
      vacationMessage: null,
      vacationStartDate: null,
      vacationEndDate: null,
      autoReplyEnabled: false,
      autoReplyMessage: null,
      processingTimeMinDays: 3,
      processingTimeMaxDays: 5,
    },
    business: {
      acceptCustomOrders: true,
      customOrderMinimum: null,
      acceptRushOrders: false,
      rushOrderFeePercentage: 25,
      returnPolicy: '30_days',
      acceptsExchanges: true,
    },
    privacy: {
      showSalesCount: true,
      showReviewCount: true,
      showJoinDate: true,
      allowCustomerContact: true,
      showBusinessLocation: true,
      allowMessagesFromFollowersOnly: false,
      allowMessagesFromPurchasersOnly: false,
      allowMessagesFromVerifiedUsersOnly: false,
      blockedUserIds: [],
    },
    communication: {
      autoResponseDelay: 24,
      responseTimeGoal: 24,
      preferredContactMethod: 'platform_message',
    },
    display: {
      language: 'en',
      currency: 'USD',
      measurementSystem: 'imperial',
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
    },
    createdAt: now,
    updatedAt: now,
  };
}

function deepMerge<T extends Record<string, any>>(base: T, incoming: unknown): T {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { ...base };
  }
  const source = incoming as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(base)) {
    const next = source[key];
    if (next === undefined || next === null) {
      continue;
    }
    if (Array.isArray(value)) {
      merged[key] = Array.isArray(next) ? next : value;
      continue;
    }
    if (value && typeof value === 'object') {
      merged[key] = deepMerge(value as Record<string, any>, next as unknown);
      continue;
    }
    merged[key] = next;
  }

  return merged as T;
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: "maker-domain", service: "get-maker-settings" });

  if (!MAKER_SETTINGS_TABLE_NAME) {
    console.error('MAKER_SETTINGS_TABLE_NAME is not configured');
    throw new Error('Internal server error');
  }

  // Get authenticated user
  const userId = requireAuthenticatedUser(event);
  if (!userId) {
    console.error('User not authenticated');
    throw new Error('Not authenticated');
  }

  
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  try {
    const result = await client.send(
      new GetCommand({
        TableName: MAKER_SETTINGS_TABLE_NAME,
        Key: { 
          userId: userId,
        },
      }),
    );

    const defaults = buildDefaultSettings(userId);

    if (!result.Item) {
      await client.send(
        new PutCommand({
          TableName: MAKER_SETTINGS_TABLE_NAME,
          Item: defaults,
          ConditionExpression: 'attribute_not_exists(userId)',
        }),
      );
      return defaults;
    }

    const normalized = deepMerge(defaults, result.Item);
    normalized.userId = userId;
    normalized.createdAt = (result.Item as any).createdAt || defaults.createdAt;
    normalized.updatedAt = new Date().toISOString();

    if (JSON.stringify(result.Item) !== JSON.stringify(normalized)) {
      await client.send(
        new PutCommand({
          TableName: MAKER_SETTINGS_TABLE_NAME,
          Item: normalized,
        }),
      );
    }

    return normalized;
  } catch (err) {
    console.error('getMakerSettings error:', err);
    throw new Error('Failed to get maker settings');
  }
};