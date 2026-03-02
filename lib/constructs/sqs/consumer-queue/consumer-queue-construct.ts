import * as cdk from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface ConsumerQueueConstructProps {
  environment: string;
  regionCode: string;
  consumerDomainName: string;
  queueName: string;
  lambdaTimeoutSeconds?: number;
  removalPolicy?: cdk.RemovalPolicy;
}

export class ConsumerQueueConstruct extends Construct {
  public readonly queue: sqs.Queue;
  public readonly dlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: ConsumerQueueConstructProps) {
    super(scope, id);
    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;
    const lambdaTimeout = props.lambdaTimeoutSeconds ?? 60;
    const visibilityTimeout = lambdaTimeout * 6;

    this.dlq = new sqs.Queue(this, "DLQ", {
      queueName: `${props.environment}-${props.regionCode}-${props.consumerDomainName}-${props.queueName}-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy,
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    this.queue = new sqs.Queue(this, "Queue", {
      queueName: `${props.environment}-${props.regionCode}-${props.consumerDomainName}-${props.queueName}`,
      visibilityTimeout: cdk.Duration.seconds(visibilityTimeout),
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy,
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount: 5,
      },
    });
  }
}
