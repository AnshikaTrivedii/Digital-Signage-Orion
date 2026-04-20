import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, AssetType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { RequestUploadDto } from './dto/request-upload.dto';
import { UpdateAssetTagsDto } from './dto/update-asset-tags.dto';

const ALLOWED_MIME_TYPES: Record<string, AssetType> = {
  'image/jpeg': AssetType.IMAGE,
  'image/png': AssetType.IMAGE,
  'image/webp': AssetType.IMAGE,
  'image/gif': AssetType.IMAGE,
  'image/svg+xml': AssetType.IMAGE,
  'video/mp4': AssetType.VIDEO,
  'video/quicktime': AssetType.VIDEO,
  'video/webm': AssetType.VIDEO,
  'text/html': AssetType.HTML,
  'application/pdf': AssetType.DOCUMENT,
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditService: AuditService,
  ) {}

  async requestUpload(actor: RequestActor, organizationId: string, dto: RequestUploadDto) {
    this.ensureOrganizationAccess(actor, organizationId);

    const assetType = ALLOWED_MIME_TYPES[dto.mimeType];
    if (!assetType) {
      const allowed = Object.keys(ALLOWED_MIME_TYPES).join(', ');
      throw new BadRequestException(`Unsupported file type: ${dto.mimeType}. Allowed: ${allowed}`);
    }

    const asset = await this.prisma.asset.create({
      data: {
        organizationId,
        name: dto.filename,
        type: assetType,
        status: AssetStatus.UPLOADING,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        s3Key: '', // placeholder, set after key is built
        uploadedById: actor.userId,
      },
    });

    const s3Key = this.s3.buildAssetKey(organizationId, asset.id, dto.filename);

    const updatedAsset = await this.prisma.asset.update({
      where: { id: asset.id },
      data: { s3Key },
    });

    const uploadUrl = await this.s3.generateUploadUrl(s3Key, dto.mimeType);

    return {
      asset: this.formatAsset(updatedAsset),
      uploadUrl,
    };
  }

  async confirmUpload(actor: RequestActor, organizationId: string, assetId: string) {
    this.ensureOrganizationAccess(actor, organizationId);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.status === AssetStatus.READY) {
      const downloadUrl = await this.s3.generateDownloadUrl(asset.s3Key);
      return {
        ...this.formatAsset(asset),
        downloadUrl,
      };
    }

    // Verify the file actually exists in S3
    const head = await this.s3.headObject(asset.s3Key);
    if (!head) {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: { status: AssetStatus.ERROR },
      });
      throw new BadRequestException('File not found in storage. Upload may have failed.');
    }

    const updatedAsset = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: AssetStatus.READY,
        fileSize: head.contentLength || asset.fileSize,
      },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.uploaded',
      targetType: 'asset',
      targetId: assetId,
      summary: `${actor.email} uploaded ${asset.name}`,
      metadata: { filename: asset.name, type: asset.type, fileSize: updatedAsset.fileSize },
    });

    const downloadUrl = await this.s3.generateDownloadUrl(updatedAsset.s3Key);
    return {
      ...this.formatAsset(updatedAsset),
      downloadUrl,
    };
  }

  async listAssets(
    actor: RequestActor,
    organizationId: string,
    filters: { type?: string; search?: string; page?: number; limit?: number },
  ) {
    this.ensureOrganizationAccess(actor, organizationId);

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organizationId,
      status: AssetStatus.READY,
    };

    if (filters.type && Object.values(AssetType).includes(filters.type as AssetType)) {
      where.type = filters.type;
    }

    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          uploadedBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    const assetsWithUrls = await Promise.all(
      assets.map(async (asset) => {
        const downloadUrl = asset.status === AssetStatus.READY
          ? await this.s3.generateDownloadUrl(asset.s3Key)
          : null;
        return {
          ...this.formatAsset(asset),
          downloadUrl,
        };
      })
    );

    return {
      assets: assetsWithUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAsset(actor: RequestActor, organizationId: string, assetId: string) {
    this.ensureOrganizationAccess(actor, organizationId);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
      include: {
        uploadedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const downloadUrl = asset.status === AssetStatus.READY
      ? await this.s3.generateDownloadUrl(asset.s3Key)
      : null;

    return {
      ...this.formatAsset(asset),
      downloadUrl,
    };
  }

  async deleteAsset(actor: RequestActor, organizationId: string, assetId: string) {
    this.ensureOrganizationAccess(actor, organizationId);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Delete from S3 first
    if (asset.s3Key) {
      try {
        await this.s3.deleteObject(asset.s3Key);
      } catch {
        // Log but don't block DB delete — orphaned S3 objects can be cleaned up later
      }
    }

    await this.prisma.asset.delete({ where: { id: assetId } });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.deleted',
      targetType: 'asset',
      targetId: assetId,
      summary: `${actor.email} deleted asset ${asset.name}`,
      metadata: { filename: asset.name, type: asset.type },
    });

    return { success: true };
  }

  async updateTags(actor: RequestActor, organizationId: string, assetId: string, dto: UpdateAssetTagsDto) {
    this.ensureOrganizationAccess(actor, organizationId);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: { tags: dto.tags },
    });

    const downloadUrl = updated.status === AssetStatus.READY
      ? await this.s3.generateDownloadUrl(updated.s3Key)
      : null;

    return {
      ...this.formatAsset(updated),
      downloadUrl,
    };
  }

  private ensureOrganizationAccess(actor: RequestActor, organizationId: string) {
    // Platform admins can access any organization
    if (actor.platformRole === 'SUPER_ADMIN' || actor.platformRole === 'PLATFORM_ADMIN') {
      return;
    }

    // Regular users must have an active membership in this organization
    if (actor.organization?.id === organizationId) {
      return;
    }

    throw new ForbiddenException('No access to this organization');
  }

  private formatAsset(asset: Record<string, unknown>) {
    return {
      id: asset.id,
      organizationId: asset.organizationId,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width ?? null,
      height: asset.height ?? null,
      durationMs: asset.durationMs ?? null,
      tags: asset.tags ?? [],
      uploadedBy: asset.uploadedBy ?? null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }
}
