import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import type { DomainStackProps } from "./domain-stack-props";
import { MakerAppSyncConstruct } from "./constructs/appsync/maker-appsync/maker-appsync-construct";
import { MakerTablesConstruct } from "./constructs/dynamodb/maker-tables/maker-tables-construct";
import { OutboxTableConstruct } from "./constructs/dynamodb/outbox-table/outbox-table-construct";
import { RepublishLambdaConstruct } from "./constructs/lambda/republish/republish-lambda-construct";
import { GetMakerProfileLambdaConstruct } from "./constructs/lambda/maker/get-maker-profile/get-maker-profile-lambda-construct";
import { SetupMakerProfileLambdaConstruct } from "./constructs/lambda/maker/setup-maker-profile/setup-maker-profile-lambda-construct";
import { UpdateMakerProfileLambdaConstruct } from "./constructs/lambda/maker/update-maker-profile/update-maker-profile-lambda-construct";
import { UpdateSkillsLambdaConstruct } from "./constructs/lambda/maker/update-skills/update-skills-lambda-construct";
import { GetVerificationStatusLambdaConstruct } from "./constructs/lambda/maker/get-verification-status/get-verification-status-lambda-construct";
import { NewMakerFromAuthLambdaConstruct } from "./constructs/lambda/maker/new-maker-from-auth/new-maker-from-auth-lambda-construct";
import { GetMakerSettingsLambdaConstruct } from "./constructs/lambda/maker/get-maker-settings/get-maker-settings-lambda-construct";
import { UpdateMakerSettingsLambdaConstruct } from "./constructs/lambda/maker/update-maker-settings/update-maker-settings-lambda-construct";
import { MakerOperationsLambdaConstruct } from "./constructs/lambda/maker/operations/maker-operations-lambda-construct";
import { CraftHeritageLambdaConstruct } from "./constructs/lambda/maker/craft-heritage/craft-heritage-lambda-construct";
import { MakerAppSyncResolversConstruct } from "./constructs/appsync/maker-appsync-resolvers/maker-appsync-resolvers-construct";
import { importEventBusFromSharedInfra } from "./utils/eventbridge-helper";

export class MakerDomainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("Domain", "hand-made-maker-domain");
    cdk.Tags.of(this).add("Environment", props.environment);
    cdk.Tags.of(this).add("Project", "hand-made");
    cdk.Tags.of(this).add("Region", props.regionCode);
    cdk.Tags.of(this).add("StackName", this.stackName);

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    // Create DynamoDB tables
    const makerTables = new MakerTablesConstruct(this, "MakerTables", {
      environment: props.environment,
      regionCode: props.regionCode,
      removalPolicy,
    });

    const idempotencyTable = new dynamodb.Table(this, "MakerIdempotencyTable", {
      tableName: `${props.environment}-${props.regionCode}-maker-domain-idempotency`,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expires_at",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === "prod" },
    });

    const sharedEventBus = importEventBusFromSharedInfra(this, props.environment);
    const schemaRegistryName = ssm.StringParameter.valueForStringParameter(
      this,
      `/${props.environment}/shared-infra/glue/schema-registry-name`,
    );

    // ========== PRODUCER PATTERN: Outbox + Republish ==========
    const outboxTable = new OutboxTableConstruct(this, "OutboxTable", {
      environment: props.environment,
      regionCode: props.regionCode,
      domainName: "maker-domain",
      removalPolicy,
    });

    const republishLambda = new RepublishLambdaConstruct(this, "RepublishLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      domainName: "maker-domain",
      outboxTable: outboxTable.table,
      eventBus: sharedEventBus,
      schemaRegistryName,
      removalPolicy,
    });

    // Export table names to SSM for cross-stack references
    new ssm.StringParameter(this, 'MakerProfilesTableNameParameter', {
      parameterName: `/${props.environment}/maker-domain/dynamodb/profiles-table-name`,
      stringValue: makerTables.makerProfiles.tableName,
      description: 'Maker Profiles DynamoDB Table Name',
    });

    new ssm.StringParameter(this, 'MakerSettingsTableNameParameter', {
      parameterName: `/${props.environment}/maker-domain/dynamodb/settings-table-name`,
      stringValue: makerTables.makerSettings.tableName,
      description: 'Maker Settings DynamoDB Table Name',
    });

    // Create AppSync GraphQL API for Maker Domain
    const makerAppSync = new MakerAppSyncConstruct(this, "MakerAppSync", {
      environment: props.environment,
      regionCode: props.regionCode,
    });

    // Create Maker Profile Lambda functions
    const getMakerProfileLambda = new GetMakerProfileLambdaConstruct(this, "GetMakerProfileLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerProfiles: makerTables.makerProfiles,
      removalPolicy,
    });

    const setupMakerProfileLambda = new SetupMakerProfileLambdaConstruct(this, "SetupMakerProfileLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerProfiles: makerTables.makerProfiles,
      eventBus: sharedEventBus,
      removalPolicy,
    });

    const updateMakerProfileLambda = new UpdateMakerProfileLambdaConstruct(this, "UpdateMakerProfileLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerProfiles: makerTables.makerProfiles,
      auditLogs: makerTables.makerAuditLogs,
      idempotencyTable,
      removalPolicy,
    });

    const updateSkillsLambda = new UpdateSkillsLambdaConstruct(this, "UpdateSkillsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerProfiles: makerTables.makerProfiles,
      removalPolicy,
    });

    const getVerificationStatusLambda = new GetVerificationStatusLambdaConstruct(this, "GetVerificationStatusLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerProfiles: makerTables.makerProfiles,
      removalPolicy,
    });

    const newMakerFromAuthLambda = new NewMakerFromAuthLambdaConstruct(this, "NewMakerFromAuthLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerProfiles: makerTables.makerProfiles,
      makerSettings: makerTables.makerSettings,
      eventBus: sharedEventBus,
      idempotencyTable,
      outboxTable: outboxTable.table,
      schemaRegistryName,
      removalPolicy,
    });

    const getMakerSettingsLambda = new GetMakerSettingsLambdaConstruct(this, "GetMakerSettingsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerSettings: makerTables.makerSettings,
      removalPolicy,
    });

    const updateMakerSettingsLambda = new UpdateMakerSettingsLambdaConstruct(this, "UpdateMakerSettingsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerSettings: makerTables.makerSettings,
      auditLogs: makerTables.makerAuditLogs,
      idempotencyTable,
      removalPolicy,
    });

    const makerOperationsLambda = new MakerOperationsLambdaConstruct(this, "MakerOperationsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      makerOperations: makerTables.makerOperations,
      removalPolicy,
    });

    const craftHeritageLambda = new CraftHeritageLambdaConstruct(this, "CraftHeritageLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      craftHeritage: makerTables.craftHeritage,
      removalPolicy,
    });

    // Create AppSync resolvers
    const makerResolvers = new MakerAppSyncResolversConstruct(this, "MakerResolvers", {
      api: makerAppSync.api,
      getMakerProfileLambda: getMakerProfileLambda.function,
      setupMakerProfileLambda: setupMakerProfileLambda.function,
      updateMakerProfileLambda: updateMakerProfileLambda.function,
      updateSkillsLambda: updateSkillsLambda.function,
      getVerificationStatusLambda: getVerificationStatusLambda.function,
      getMakerSettingsLambda: getMakerSettingsLambda.function,
      updateMakerSettingsLambda: updateMakerSettingsLambda.function,
      operationsLambda: makerOperationsLambda.function,
      craftHeritageLambda: craftHeritageLambda.function,
    });
  }
}
