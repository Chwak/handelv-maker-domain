import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface MakerTablesConstructProps {
  environment: string;
  regionCode: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class MakerTablesConstruct extends Construct {
  public readonly makerProfiles: dynamodb.Table;
  public readonly makerSettings: dynamodb.Table;
  public readonly makerAuditLogs: dynamodb.Table;
  public readonly makerOperations: dynamodb.Table;
  public readonly craftHeritage: dynamodb.Table;

  constructor(scope: Construct, id: string, props: MakerTablesConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // =====================================================
    // Maker Profiles Table
    // Domain Responsibility: MAKER DOMAIN ONLY
    // Purpose: Source of truth for maker profile data
    // Key Structure: PK=userId | No sort key (one profile per user)
    // =====================================================
    this.makerProfiles = new dynamodb.Table(this, 'MakerProfilesTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-profiles-table`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    this.makerProfiles.addGlobalSecondaryIndex({
      indexName: 'GSI1-CreatedAt',
      partitionKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI for email uniqueness checking
    this.makerProfiles.addGlobalSecondaryIndex({
      indexName: 'GSI2-Email',
      partitionKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // =====================================================
    // Maker Settings/Preferences Table
    // Domain Responsibility: MAKER DOMAIN ONLY
    // Purpose: Store maker preferences, notification settings, display options
    // Key Structure: PK=userId | No sort key (one settings doc per user)
    // =====================================================
    this.makerSettings = new dynamodb.Table(this, 'MakerSettingsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-settings-table`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // =====================================================
    // Maker Audit Log Table
    // Domain Responsibility: MAKER DOMAIN ONLY
    // Purpose: Audit trail for settings/profile changes
    // Key Structure: PK=userId | SK=timestamp#action
    // =====================================================
    this.makerAuditLogs = new dynamodb.Table(this, 'MakerAuditLogsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-audit-table`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'eventKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'expires_at',
    });

    // =====================================================
    // Maker Operations Table
    // Domain Responsibility: MAKER DOMAIN ONLY
    // Purpose: Weekly availability, vacation mode, and workload state
    // Key Structure: PK=makerUserId | SK=weekDate
    // =====================================================
    this.makerOperations = new dynamodb.Table(this, 'MakerOperationsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-operations-table`,
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'weekDate',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // =====================================================
    // Craft Heritage Table
    // Domain Responsibility: MAKER DOMAIN ONLY
    // Purpose: Long-form maker craft lineage and tradition records
    // Key Structure: PK=makerUserId | SK=heritageId
    // =====================================================
    this.craftHeritage = new dynamodb.Table(this, 'CraftHeritageTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-craft-heritage-table`,
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'heritageId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

  }
}
