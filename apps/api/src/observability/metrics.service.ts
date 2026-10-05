import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

type CounterName =
  | 'HeartbeatSuccess'
  | 'PopLogsEnqueued'
  | 'PopLogsDuplicates'
  | 'PopLogsInvalid'
  | 'MediaDownloadFailures';

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private readonly namespace = process.env.METRICS_NAMESPACE ?? 'Orion';
  private readonly environment = process.env.ORION_ENV ?? process.env.NODE_ENV ?? 'development';
  private readonly enabled = process.env.CLOUDWATCH_METRICS !== 'false';
  private readonly client = new CloudWatchClient({
    region: process.env.AWS_REGION ?? process.env.S3_REGION ?? 'ap-south-1',
  });
  private readonly counts = new Map<CounterName, number>();
  private timer: NodeJS.Timeout | null = null;

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, 15_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    return this.flush();
  }

  increment(name: CounterName, amount = 1) {
    if (!this.enabled || amount <= 0) return;
    this.counts.set(name, (this.counts.get(name) ?? 0) + amount);
  }

  async flush() {
    if (!this.enabled || this.counts.size === 0) return;
    const snapshot = [...this.counts.entries()];
    this.counts.clear();
    try {
      await this.client.send(
        new PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: snapshot.map(([name, value]) => ({
            MetricName: name,
            Value: value,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
            Dimensions: [{ Name: 'Environment', Value: this.environment }],
          })),
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to flush CloudWatch metrics: ${(error as Error).message}`);
      for (const [name, value] of snapshot) {
        this.counts.set(name, (this.counts.get(name) ?? 0) + value);
      }
    }
  }
}
