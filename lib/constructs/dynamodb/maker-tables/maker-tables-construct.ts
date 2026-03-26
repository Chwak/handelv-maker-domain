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

    this.makerProfiles = new dynamodb.Table(this, 'MakerProfilesTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-profiles-table`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    this.makerProfiles.addGlobalSecondaryIndex({
      indexName: 'GSI1-CreatedAt',
      partitionKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    this.makerProfiles.addGlobalSecondaryIndex({
      indexName: 'GSI2-Email',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    this.makerSettings = new dynamodb.Table(this, 'MakerSettingsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-settings-table`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.makerAuditLogs = new dynamodb.Table(this, 'MakerAuditLogsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-audit-table`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'expires_at',
    });

    this.makerOperations = new dynamodb.Table(this, 'MakerOperationsTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-operations-table`,
      partitionKey: { name: 'makerUserId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'weekDate', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.craftHeritage = new dynamodb.Table(this, 'CraftHeritageTable', {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-craft-heritage-table`,
      partitionKey: { name: 'makerUserId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'heritageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });
  }
}
