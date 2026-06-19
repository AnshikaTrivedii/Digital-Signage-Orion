import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly uploadDir: string;
  private readonly logger = new Logger(S3Service.name);

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? 'orion-assets';
    this.uploadDir = resolve(process.env.ASSET_UPLOAD_DIR ?? 'tmp/uploads');

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

    if (this.useLocalStorage) {
      this.logger.log(`Using local disk storage at ${this.uploadDir}`);
    }
  }

  get useLocalStorage(): boolean {
    if (process.env.S3_USE_LOCAL_STORAGE === 'true') return true;
    if (process.env.S3_USE_LOCAL_STORAGE === 'false') return false;

    const accessKey = process.env.S3_ACCESS_KEY_ID ?? '';
    return !accessKey || accessKey === 'your-access-key-id';
  }

  /** Build the org-scoped S3 key for an asset file */
  buildAssetKey(organizationId: string, assetId: string, filename: string): string {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${organizationId}/assets/${assetId}/${sanitized}`;
  }

  buildLocalUploadUrl(organizationId: string, assetId: string): string {
    const port = process.env.PORT ?? 3001;
    const base = (process.env.API_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
    return `${base}/api/organizations/${organizationId}/assets/${assetId}/upload`;
  }

  buildLocalDownloadUrl(key: string): string {
    const port = process.env.PORT ?? 3001;
    const base = (process.env.API_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
    return `${base}/uploads/${key}`;
  }

  private localPath(key: string): string {
    return join(this.uploadDir, key);
  }

  async saveLocalFile(key: string, data: Buffer): Promise<void> {
    const filePath = this.localPath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
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
    if (this.useLocalStorage) {
      return this.buildLocalDownloadUrl(key);
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /** Check if a file exists in S3 and return its metadata */
  async headObject(
    key: string,
  ): Promise<{ contentLength: number; contentType: string; etag: string | null } | null> {
    if (this.useLocalStorage) {
      try {
        const fileStat = await stat(this.localPath(key));
        return {
          contentLength: fileStat.size,
          contentType: 'application/octet-stream',
          etag: `${fileStat.size}-${fileStat.mtimeMs}`,
        };
      } catch {
        return null;
      }
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.client.send(command);
      const rawEtag = response.ETag ?? null;
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
        etag: rawEtag ? rawEtag.replace(/"/g, '') : null,
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
    if (this.useLocalStorage) {
      try {
        await unlink(this.localPath(key));
      } catch (error: unknown) {
        const code = (error as { code?: string })?.code;
        if (code !== 'ENOENT') {
          this.logger.error(`Local delete failed for key=${key}`, error);
          throw error;
        }
      }
      return;
    }

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
