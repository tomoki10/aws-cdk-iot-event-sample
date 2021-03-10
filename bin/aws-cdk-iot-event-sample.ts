#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsCdkIotEventSampleStack } from '../lib/aws-cdk-iot-event-sample-stack';

const app = new cdk.App();
new AwsCdkIotEventSampleStack(app, 'AwsCdkIotEventSampleStack');
