import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface UpdateMakerSettingsLambdaConstructProps {
  environment: string;
  regionCode: string;
  makerSettings: dynamodb.ITable;
  auditLogs: dynamodb.ITable;
  idempotencyTable: dynamodb.ITable;
  removalPolicy?: cdk.RemovalPolicy;
}

export class UpdateMakerSettingsLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: UpdateMakerSettingsLambdaConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'UpdateMakerSettingsLambdaRole', {
      roleName: `${props.environment}-${props.regionCode}-maker-domain-update-maker-settings-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Update Maker Settings Lambda',
      inlinePolicies: {
        CloudWatchLogsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/${props.environment}-${props.regionCode}-maker-domain-update-maker-settings-lambda*`,
              ],
            }),
          ],
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
              resources: [
                props.makerSettings.tableArn,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
              resources: [
                props.idempotencyTable.tableArn,
                props.auditLogs.tableArn,
              ],
            }),
          ],
        }),
      },
    });

    const logGroup = new logs.LogGroup(this, 'UpdateMakerSettingsLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-maker-domain-update-maker-settings-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, '../../../../functions/lambda/maker/update-maker-settings/update-maker-settings-lambda.ts');
    this.function = new NodejsFunction(this, 'UpdateMakerSettingsFunction', {
      functionName: `${props.environment}-${props.regionCode}-maker-domain-update-maker-settings-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: lambdaCodePath,
      role,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        ENVIRONMENT: props.environment,
        MAKER_SETTINGS_TABLE_NAME: props.makerSettings.tableName,
        IDEMPOTENCY_TABLE_NAME: props.idempotencyTable.tableName,
        AUDIT_TABLE_NAME: props.auditLogs.tableName,
        FEATURE_FLAGS: 'auditTrail=true,rateLimit=true,idempotency=true',
        RATE_LIMIT_PER_MINUTE: '10',
      },
      description: 'Update maker preferences and settings',
    });
  }
}
