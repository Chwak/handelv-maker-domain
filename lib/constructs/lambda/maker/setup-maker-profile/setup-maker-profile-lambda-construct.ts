import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import * as path from 'path';
import { getLogRetentionDays } from '../../../../utils/lambda-log-retention';

export interface SetupMakerProfileLambdaConstructProps {
  environment: string;
  regionCode: string;
  makerProfiles: dynamodb.ITable;
  eventBus: events.IEventBus;
  removalPolicy?: cdk.RemovalPolicy;
}

export class SetupMakerProfileLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: SetupMakerProfileLambdaConstructProps) {
    super(scope, id);

    const functionName = `${props.environment}-${props.regionCode}-maker-domain-setup-maker-profile-lambda`;

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: getLogRetentionDays(props.environment),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, '../../../../functions/lambda/maker/setup-maker-profile/setup-maker-profile-lambda.ts');
    this.function = new NodejsFunction(this, 'Function', {
      functionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: lambdaCodePath,
      environment: {
        MAKER_PROFILES_TABLE_NAME: props.makerProfiles.tableName,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        EVENT_SOURCE: 'hand-made.maker-domain',
        NODE_ENV: props.environment,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup,
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
      },
      description: 'Setup maker profile during onboarding',
    });

    // Grant permissions
    props.makerProfiles.grantReadWriteData(this.function);
    props.eventBus.grantPutEventsTo(this.function);

    // Tags
    cdk.Tags.of(this.function).add('Domain', 'maker-domain');
    cdk.Tags.of(this.function).add('Function', 'setup-maker-profile');
    cdk.Tags.of(this.function).add('Environment', props.environment);
  }
}
