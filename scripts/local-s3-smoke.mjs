import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
const bucket = process.env.S3_BUCKET;
const key = `local-smoke/${randomUUID()}.txt`;
const body = 'Orion local S3 upload and download';

try {
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'text/plain' }),
    { expiresIn: 60 },
  );
  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  assert.equal(upload.status, 200, `S3 upload failed: ${await upload.text()}`);

  const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  assert.equal(metadata.ContentLength, Buffer.byteLength(body));

  const downloadUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 60 },
  );
  const download = await fetch(downloadUrl);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), body);
  console.log('Local S3 signed PUT, HEAD, and signed GET passed.');
} finally {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  client.destroy();
}
