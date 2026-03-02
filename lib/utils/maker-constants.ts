/**
 * Standardized constants for Maker Domain operations.
 * Includes TTL policies, error messages, and configuration values.
 */

/**
 * TTL Policies for DynamoDB Items
 * Defines how long different types of activity records are retained.
 * All values in seconds.
 */
export const TTL_POLICIES = {
  // Short-lived: Activity records for recent interactions (30 days)
  ACTIVITY_SHORT: 30 * 24 * 60 * 60,
  // Medium: Profile updates and skill changes (90 days)
  ACTIVITY_MEDIUM: 90 * 24 * 60 * 60,
  // Long: Registration events and profile setup (365 days)
  ACTIVITY_LONG: 365 * 24 * 60 * 60,
} as const;

/**
 * Standard Error Messages
 * Provides consistent error responses across all lambdas.
 */
export const ERROR_MESSAGES = {
  INTERNAL_SERVER_ERROR: 'Internal server error',
  MISSING_TABLE_CONFIG: 'Table names not configured',
  INVALID_INPUT_FORMAT: 'Invalid input format',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Update conflict. Please try again.',
  PROFILE_NOT_FOUND: 'Maker profile not found',
  OPERATIONS_NOT_FOUND: 'Operations not found for this week. Use setupOperations first.',
  UNVERIFIED_OPERATIONS: 'Cannot update unverified operations. Use setupOperations first.',
  MISSING_REQUIRED_FIELDS: 'Missing required fields',
  INVALID_WORKLOAD: 'workingDaysThisWeek must contain values 0-6 (Sun-Sat)',
  VACATION_REQUIRES_DATES: 'Vacation mode requires start and end dates',
  INVALID_TIMEZONE: 'Invalid timezone format. Expected format: Region/City (e.g., America/New_York)',
} as const;

/**
 * Validation Constraints
 * Field length limits and value ranges.
 */
export const VALIDATION_CONSTRAINTS = {
  // Name fields
  STORE_NAME_MIN: 3,
  STORE_NAME_MAX: 100,
  BIO_MAX: 1000,
  STORE_DESCRIPTION_MAX: 2000,
  // Numeric ranges
  YEARS_OF_EXPERIENCE_MIN: 0,
  YEARS_OF_EXPERIENCE_MAX: 80,
  MAX_SKILLS: 50,
  MAX_SERVICE_AREAS: 50,
  // Timezone
  TIMEZONE_MAX: 50,
} as const;

/**
 * Event Source Names for EventBridge
 * Used when publishing domain events.
 */
export const EVENT_SOURCES = {
  MAKER_DOMAIN: 'maker-domain',
} as const;

/**
 * Event Detail Types
 * Standardized event type names for EventBridge.
 */
export const EVENT_DETAIL_TYPES = {
  MAKER_PROFILE_CREATED: 'MakerProfileCreated',
  MAKER_PROFILE_UPDATED: 'MakerProfileUpdated',
  MAKER_SKILLS_UPDATED: 'MakerSkillsUpdated',
  MAKER_OPERATIONS_SETUP: 'MakerOperationsSetup',
  MAKER_VACATION_MODE_SET: 'MakerVacationModeSet',
} as const;
