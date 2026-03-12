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
  public readonly commissionProposals: dynamodb.Table;
  public readonly milestoneClips: dynamodb.Table;

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
    // Commission Proposals Table
    // Domain Responsibility: MAKER DOMAIN ONLY
    // Purpose: Stores Vision Brief proposals from collectors to makers
    // Key Structure: PK=proposalId | No sort key (single item per proposal)
    // =====================================================
    this.commissionProposals = new dynamodb.Table(this, 'CommissionProposalsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-commission-proposals-table`,
      partitionKey: {
        name: 'proposalId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI1: Maker queries their incoming proposals, optionally filtered by status
    this.commissionProposals.addGlobalSecondaryIndex({
      indexName: 'GSI1-MakerId-Status',
      partitionKey: { name: 'makerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Collector queries their submitted proposals
    this.commissionProposals.addGlobalSecondaryIndex({
      indexName: 'GSI2-CollectorId-CreatedAt',
      partitionKey: { name: 'collectorId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: Status-based queries for admin/analytics
    this.commissionProposals.addGlobalSecondaryIndex({
      indexName: 'GSI3-Status-CreatedAt',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // =====================================================
    // Milestone Clips Table
    // Domain Responsibility: MAKER DOMAIN ONLY
    // Purpose: Creation progress chapters added by maker during commission
    // Key Structure: PK=proposalId | SK=createdAt#clipId (ordered)
    // =====================================================
    this.milestoneClips = new dynamodb.Table(this, 'MilestoneClipsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-milestone-clips-table`,
      partitionKey: {
        name: 'proposalId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'clipKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });
  }
}
