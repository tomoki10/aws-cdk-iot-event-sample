import * as cdk from "@aws-cdk/core";
import * as iot from "@aws-cdk/aws-iot";
import * as iotEvents from "@aws-cdk/aws-iotevents";
import * as sns from "@aws-cdk/aws-sns";
import * as iam from "@aws-cdk/aws-iam";

const SUBSCRIPTION_EMAIL = process.env.SUBSCRIPTION_EMAIL!;

export class AwsCdkIotEventSampleStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    if (!SUBSCRIPTION_EMAIL) {
      console.log("Set your email to an environment variable");
      throw new Error();
    }

    const lineNotificationTopic = new sns.Topic(this, "LineNotificationTopic");
    new sns.Subscription(this, "LineNotificationSubscribe", {
      endpoint: SUBSCRIPTION_EMAIL,
      protocol: sns.SubscriptionProtocol.EMAIL,
      topic: lineNotificationTopic,
    });

    const lineInput = new iotEvents.CfnInput(this, "LineInput", {
      inputName: "lineInput",
      inputDefinition: {
        attributes: [
          { jsonPath: "deviceId" },
          { jsonPath: "lineStartTime" },
          { jsonPath: "lineEndTime" },
        ],
      },
    });

    const lineIotTopicRole = new iam.Role(this, "LineIotTopicRole", {
      assumedBy: new iam.ServicePrincipal("iot.amazonaws.com"),
      managedPolicies: [
        { managedPolicyArn: "arn:aws:iam::aws:policy/AWSIoTEventsFullAccess" },
      ],
    });

    const lineIotTopic = new iot.CfnTopicRule(this, "LineIotTopic", {
      topicRulePayload: {
        sql: `SELECT deviceId, lineStartTime, lineEndTime  FROM 'line/'`,
        actions: [
          {
            iotEvents: {
              inputName: lineInput.inputName!,
              roleArn: lineIotTopicRole.roleArn,
            },
          },
        ],
        ruleDisabled: false,
        awsIotSqlVersion: "2016-03-23",
      },
      ruleName: `LineIotTopicRule`,
    });

    const lineModelRole = new iam.Role(this, "LineModelRole", {
      assumedBy: new iam.ServicePrincipal("iotevents.amazonaws.com"),
      managedPolicies: [
        {
          managedPolicyArn: "arn:aws:iam::aws:policy/AWSIoTEventsFullAccess",
        },
        {
          managedPolicyArn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
        },
      ],
    });

    // HINT: Exporting the IoT Events model created in the AWS console
    //       and using it can be implemented quickly.
    const linedetectorModelDefinition = {
      initialStateName: "line-start",
      states: [
        {
          stateName: "line-start",
          onEnter: {
            events: [
              {
                eventName: "variable-initialize",
                condition: `true`,
                actions: [
                  {
                    setVariable: {
                      variableName: "previosLineStartTime",
                      value: `$input.${lineInput.inputName}.lineStartTime`,
                    },
                  },
                  {
                    setVariable: {
                      variableName: "previosLineEndTime",
                      value: `$input.${lineInput.inputName}.lineEndTime`,
                    },
                  },
                ],
              },
            ],
          },
          onInput: {
            transitionEvents: [
              {
                eventName: "line-end-check",
                nextState: "line-end",
                condition: `$input.${lineInput.inputName}.lineEndTime !=  $variable.previosLineEndTime`,
              },
            ],
          },
          onExit: {
            events: [
              {
                eventName: "line-start-event",
                actions: [
                  {
                    sns: {
                      payload: {
                        type: "STRING",
                        contentExpression: "'Line ended'",
                      },
                      targetArn: lineNotificationTopic.topicArn,
                    },
                  },
                  {
                    setVariable: {
                      variableName: "previosLineEndTime",
                      value: `$input.${lineInput.inputName}.lineEndTime`,
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          stateName: "line-end",
          onInput: {
            transitionEvents: [
              {
                eventName: "line-start-check",
                nextState: "line-start",
                condition: `$input.${lineInput.inputName}.lineStartTime !=  $variable.previosLineStartTime`,
              },
            ],
          },
          onExit: {
            events: [
              {
                eventName: "line-start-event",
                actions: [
                  {
                    sns: {
                      payload: {
                        type: "STRING",
                        contentExpression: "'Line sterted'",
                      },
                      targetArn: lineNotificationTopic.topicArn,
                    },
                  },
                  {
                    setVariable: {
                      variableName: "previosLineStartTime",
                      value: `$input.${lineInput.inputName}.lineStartTime`,
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    // TODO: Add Model Check Process
    // aws iotevents start-detector-model-analysis --detector-model-definition line-model

    const lineModel = new iotEvents.CfnDetectorModel(this, "lineModel", {
      detectorModelDefinition: linedetectorModelDefinition,
      detectorModelName: "line-model",
      key: "deviceId",
      evaluationMethod: "BATCH",
      roleArn: lineModelRole.roleArn,
    });
  }
}
