import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: 'http://127.0.0.1:59000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.S3_BUCKET;
try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
} catch (error) {
  if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') throw error;
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
}
await client.send(new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    }],
  },
}));
console.log(`Local S3 bucket ready: ${bucket}`);
