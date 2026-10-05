import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { PrismaClient } from '@prisma/client';
import { putGauge } from './metrics';
import { maintainPopPartitions } from './partitions';
import { consumePopLogBatch, type PopLogBatchMessage } from './pop-log-consumer';

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

async function main() {
  const queueUrl = process.env.POP_LOG_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('POP_LOG_QUEUE_URL must be set');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  const prisma = new PrismaClient();
  const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });

  await prisma.$connect();
  await maintainPopPartitions(prisma).catch((error) => {
    console.error('Initial partition maintenance failed', error);
  });

  setInterval(() => {
    void maintainPopPartitions(prisma).catch((error) => {
      console.error('Partition maintenance failed', error);
    });
  }, 6 * 60 * 60 * 1000).unref();

  setInterval(() => {
    void publishOnlineDeviceCount(prisma).catch((error) => {
      console.error('Online device metric failed', error);
    });
  }, 60 * 1000).unref();

  console.log('Orion PoP worker started');

  for (;;) {
    const response = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 120,
      }),
    );

    for (const message of response.Messages ?? []) {
      if (!message.ReceiptHandle || !message.Body) continue;
      try {
        const batch = JSON.parse(message.Body) as PopLogBatchMessage;
        await consumePopLogBatch(prisma, batch);
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      } catch (error) {
        console.error('Failed to consume PoP batch; leaving message for retry', error);
      }
    }
  }
}

async function publishOnlineDeviceCount(prisma: PrismaClient) {
  const online = await prisma.device.count({
    where: {
      isPaired: true,
      lastSeenAt: { gte: new Date(Date.now() - ONLINE_THRESHOLD_MS) },
    },
  });
  await putGauge('OnlineDevices', online);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
