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

    if (!result.Item) {
      
      // Create default settings
      const defaultSettings = {
        userId: userId,
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
          monthlySalesSummary: true,
          platformPromotions: true,
          tipsAndBestPractices: true,
          accountSecurity: true,
          policyUpdates: true,
          payoutNotifications: true,
        },
        shop: {
          isOnVacationMode: false,
          vacationMessage: null,
          vacationStartDate: null,
          vacationEndDate: null,
          autoReplyEnabled: false,
          autoReplyMessage: null,
          processingTimeMinDays: 1,
          processingTimeMaxDays: 3,
        },
        business: {
          acceptCustomOrders: true,
          customOrderMinimum: null,
          acceptRushOrders: false,
          rushOrderFeePercentage: 0,
          returnPolicy: '14_days',
          acceptsExchanges: true,
        },
        privacy: {
          showSalesCount: true,
          showReviewCount: true,
          showJoinDate: true,
          allowCustomerContact: true,
          showBusinessLocation: false,
        },
        communication: {
          autoResponseDelay: 0,
          responseTimeGoal: 24,
          preferredContactMethod: 'platform_message',
        },
        display: {
          language: 'en',
          currency: 'USD',
          measurementSystem: 'imperial',
          timezone: 'America/New_York',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Store the default settings
      await client.send(
        new PutCommand({
          TableName: MAKER_SETTINGS_TABLE_NAME,
          Item: defaultSettings,
          ConditionExpression: 'attribute_not_exists(userId)', // ✅ CRITICAL FIX: Prevent concurrent default creation
        }),
      );

      return defaultSettings;
    }
    return result.Item;
  } catch (err) {
    console.error('getMakerSettings error:', err);
    throw new Error('Failed to get maker settings');
  }
};