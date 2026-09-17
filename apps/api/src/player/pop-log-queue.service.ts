import { Injectable, Logger } from '@nestjs/common';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { PopLogBatchMessage, QueuedPopLog } from './pop-log-batch';

const MAX_SQS_BODY_BYTES = 240_000;
const MAX_LOGS_PER_MESSAGE = 100;

@Injectable()
export class PopLogQueueService {
  private readonly logger = new Logger(PopLogQueueService.name);
  private readonly queueUrl = process.env.POP_LOG_QUEUE_URL ?? '';
  private readonly client = this.queueUrl ? new SQSClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }) : null;

  get enabled() {
    return Boolean(this.queueUrl && this.client);
  }

  async enqueue(message: Omit<PopLogBatchMessage, 'logs'> & { logs: QueuedPopLog[] }) {
    if (!this.client || !this.queueUrl) {
      throw new Error('POP_LOG_QUEUE_URL is not configured');
    }

    const chunks = this.chunk(message.logs);
    for (const logs of chunks) {
      const body = JSON.stringify({ ...message, logs } satisfies PopLogBatchMessage);
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: body,
        }),
      );
    }
    this.logger.log(`Enqueued ${message.logs.length} PoP events for deviceId=${message.deviceId} in ${chunks.length} message(s)`);
  }

  private chunk(logs: QueuedPopLog[]): QueuedPopLog[][] {
    const chunks: QueuedPopLog[][] = [];
    let current: QueuedPopLog[] = [];
    for (const log of logs) {
      const candidate = [...current, log];
      const size = Buffer.byteLength(JSON.stringify({ logs: candidate }), 'utf8');
      if (current.length >= MAX_LOGS_PER_MESSAGE || (current.length > 0 && size > MAX_SQS_BODY_BYTES)) {
        chunks.push(current);
        current = [log];
      } else {
        current = candidate;
      }
    }
    if (current.length) chunks.push(current);
    return chunks;
  }
}
