import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(S3Service.name);

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? 'orion-assets';

    const config: ConstructorParameters<typeof S3Client>[0] = {
      region: process.env.S3_REGION ?? 'ap-south-1',
    };

    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
    }

    if (process.env.S3_FORCE_PATH_STYLE === 'true') {
      config.forcePathStyle = true;
    }

    if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      };
    }

    this.client = new S3Client(config);
  }

  /** Build the org-scoped S3 key for an asset file */
  buildAssetKey(organizationId: string, assetId: string, filename: string): string {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${organizationId}/assets/${assetId}/${sanitized}`;
  }

  /** Generate a presigned PUT URL for uploading */
  async generateUploadUrl(key: string, contentType: string, expiresIn = 900): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /** Generate a presigned GET URL for downloading/previewing */
  async generateDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /** Check if a file exists in S3 and return its metadata */
  async headObject(key: string): Promise<{ contentLength: number; contentType: string } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.client.send(command);
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
      };
    } catch (error: unknown) {
      const code = (error as { name?: string })?.name;
      if (code === 'NotFound' || code === '404') {
        return null;
      }
      this.logger.error(`S3 headObject failed for key=${key}`, error);
      throw error;
    }
  }

  /** Delete a single object from S3 */
  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      this.logger.error(`S3 deleteObject failed for key=${key}`, error);
      throw error;
    }
  }
}
