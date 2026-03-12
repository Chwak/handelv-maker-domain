import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import { getLogRetentionDays } from '../../../../utils/lambda-log-retention';

export interface AddMilestoneClipLambdaConstructProps {
  environment: string;
  regionCode: string;
  commissionProposals: dynamodb.ITable;
  milestoneClips: dynamodb.ITable;
  outboxTable: dynamodb.ITable;
  removalPolicy?: cdk.RemovalPolicy;
}

export class AddMilestoneClipLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: AddMilestoneClipLambdaConstructProps) {
    super(scope, id);

    const functionName = `${props.environment}-${props.regionCode}-maker-domain-add-milestone-clip-lambda`;

    new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: getLogRetentionDays(props.environment),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.function = new NodejsFunction(this, 'Function', {
      functionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../../../functions/lambda/commission/add-milestone-clip/add-milestone-clip-lambda.ts'),
      environment: {
        COMMISSION_PROPOSALS_TABLE_NAME: props.commissionProposals.tableName,
        MILESTONE_CLIPS_TABLE_NAME: props.milestoneClips.tableName,
        OUTBOX_TABLE_NAME: props.outboxTable.tableName,
        EVENT_SOURCE: 'hand-made.maker-domain',
        NODE_ENV: props.environment,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: { minify: true, sourceMap: false, target: 'node22', externalModules: ['@aws-sdk/*'] },
      description: 'Maker posts a creation-progress milestone clip; also queries clips for a proposal',
    });

    props.commissionProposals.grantReadData(this.function);
    props.milestoneClips.grantReadWriteData(this.function);
    props.outboxTable.grantReadWriteData(this.function);

    cdk.Tags.of(this.function).add('Domain', 'maker-domain');
    cdk.Tags.of(this.function).add('Feature', 'commission');
    cdk.Tags.of(this.function).add('Environment', props.environment);
  }
}
