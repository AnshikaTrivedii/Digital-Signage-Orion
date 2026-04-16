import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Asset } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname } from 'path';
import { AuditService } from '../audit/audit.service';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PrismaService } from '../prisma/prisma.service';

type UploadInput = {
  originalName: string;
  mimeType: string;
  fileBuffer: Buffer;
};

const ASSET_UPLOAD_DIR = process.env.ASSET_UPLOAD_DIR ?? 'tmp/uploads';
const ASSET_PUBLIC_BASE_URL = process.env.ASSET_PUBLIC_BASE_URL;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listAssets(actor: RequestActor) {
    const organizationId = this.getActorOrganizationId(actor);
    const assets = await this.prisma.asset.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: assets.map((asset) => this.serializeAsset(asset)),
    };
  }

  async uploadAsset(actor: RequestActor, input: UploadInput) {
    const organizationId = this.getActorOrganizationId(actor);
    this.assertCanUpload(actor);

    if (!input.originalName.trim()) {
      throw new BadRequestException('File name is required');
    }

    if (input.fileBuffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }

    await fs.mkdir(ASSET_UPLOAD_DIR, { recursive: true });

    const extension = extname(input.originalName).toLowerCase();
    const safeExtension = extension.replace(/[^a-z0-9.]/g, '');
    const storageFileName = `${Date.now()}-${randomUUID()}${safeExtension}`;
    const storagePath = `${ASSET_UPLOAD_DIR}/${storageFileName}`;

    await fs.writeFile(storagePath, input.fileBuffer);

    const asset = await this.prisma.asset.create({
      data: {
        organizationId,
        uploadedById: actor.userId,
        name: storageFileName,
        originalName: input.originalName,
        mimeType: input.mimeType || 'application/octet-stream',
        fileExtension: safeExtension || null,
        fileSizeBytes: input.fileBuffer.length,
        storagePath,
        publicUrl: this.buildPublicAssetUrl(storageFileName),
      },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.uploaded',
      targetType: 'asset',
      targetId: asset.id,
      summary: `${actor.email} uploaded ${asset.originalName}`,
      metadata: {
        mimeType: asset.mimeType,
        fileSizeBytes: asset.fileSizeBytes,
        storagePath: asset.storagePath,
        publicUrl: asset.publicUrl,
      },
    });

    return this.serializeAsset(asset);
  }

  async deleteAsset(actor: RequestActor, assetId: string) {
    const organizationId = this.getActorOrganizationId(actor);
    this.assertCanUpload(actor);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    await this.prisma.asset.delete({
      where: { id: asset.id },
    });

    await fs.unlink(asset.storagePath).catch(() => undefined);

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.deleted',
      targetType: 'asset',
      targetId: asset.id,
      summary: `${actor.email} deleted ${asset.originalName}`,
      metadata: {
        storagePath: asset.storagePath,
      },
    });

    return { success: true };
  }

  private serializeAsset(asset: Asset) {
    return {
      id: asset.id,
      name: asset.name,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      fileExtension: asset.fileExtension,
      fileSizeBytes: asset.fileSizeBytes,
      publicUrl: asset.publicUrl,
      resolvedUrl: this.resolveAssetUrl(asset),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private resolveAssetUrl(asset: Asset) {
    if (asset.publicUrl) {
      return asset.publicUrl;
    }

    return this.buildPublicAssetUrl(asset.name);
  }

  private buildPublicAssetUrl(fileName: string) {
    const baseUrl = ASSET_PUBLIC_BASE_URL ?? this.getDefaultBaseUrl();
    return `${baseUrl}/uploads/${fileName}`;
  }

  private getDefaultBaseUrl() {
    const apiPort = Number(process.env.PORT ?? 3001);
    return `http://localhost:${apiPort}`;
  }

  private getActorOrganizationId(actor: RequestActor) {
    if (!actor.organization?.id) {
      throw new BadRequestException('Missing active organization context');
    }
    return actor.organization.id;
  }

  private assertCanUpload(actor: RequestActor) {
    if (!actor.organization) {
      throw new ForbiddenException('No organization context for this request');
    }

    if (actor.organization.role === 'ANALYST_VIEWER') {
      throw new ForbiddenException('Insufficient permissions to modify assets');
    }
  }
}
