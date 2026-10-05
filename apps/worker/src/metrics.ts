import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

const namespace = process.env.METRICS_NAMESPACE ?? 'Orion';
const environment = process.env.ORION_ENV ?? process.env.NODE_ENV ?? 'development';
const client = new CloudWatchClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });

export async function putCount(metricName: string, value: number) {
  if (process.env.CLOUDWATCH_METRICS === 'false' || value <= 0) return;
  await client.send(
    new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: StandardUnit.Count,
          Timestamp: new Date(),
          Dimensions: [{ Name: 'Environment', Value: environment }],
        },
      ],
    }),
  );
}

export async function putGauge(metricName: string, value: number) {
  if (process.env.CLOUDWATCH_METRICS === 'false') return;
  await client.send(
    new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: StandardUnit.Count,
          Timestamp: new Date(),
          Dimensions: [{ Name: 'Environment', Value: environment }],
        },
      ],
    }),
  );
}
