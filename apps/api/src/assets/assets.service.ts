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
import { PlaylistSyncService } from '../sync/playlist-sync.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreateUrlAssetDto } from './dto/create-url-asset.dto';
import { RequestUploadDto } from './dto/request-upload.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { UpdateAssetTagsDto } from './dto/update-asset-tags.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import {
  getPreviewKind,
  resolveUploadMedia,
} from './asset-media.utils';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditService: AuditService,
    private readonly playlistSync: PlaylistSyncService,
  ) {}

  async createUrlAsset(actor: RequestActor, organizationId: string, dto: CreateUrlAssetDto) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

    const name = dto.name.trim();
    const url = dto.url.trim();
    const defaultDurationSeconds = dto.durationSeconds ?? 15;

    if (defaultDurationSeconds < 1) {
      throw new BadRequestException('Duration must be at least 1 second');
    }

    const folderId = await this.resolveFolderId(organizationId, dto.folderId);

    const asset = await this.prisma.asset.create({
      data: {
        organizationId,
        folderId,
        name,
        type: AssetType.URL,
        status: AssetStatus.READY,
        mimeType: 'text/uri-list',
        fileSize: 0,
        s3Key: null,
        url,
        defaultDurationSeconds,
        uploadedById: actor.userId,
      },
      include: {
        uploadedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.url.created',
      targetType: 'asset',
      targetId: asset.id,
      summary: `${actor.email} created URL asset ${asset.name}`,
      metadata: { url, defaultDurationSeconds },
    });

    return this.enrichAssetResponse(asset);
  }

  async requestUpload(actor: RequestActor, organizationId: string, dto: RequestUploadDto) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

    let resolved;
    try {
      resolved = resolveUploadMedia(dto.filename, dto.mimeType);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Unsupported file type',
      );
    }

    const folderId = await this.resolveFolderId(organizationId, dto.folderId);
    const defaultDurationSeconds =
      dto.durationSeconds ?? resolved.defaultDurationSeconds;

    const asset = await this.prisma.asset.create({
      data: {
        organizationId,
        folderId,
        name: dto.filename,
        type: resolved.assetType,
        status: AssetStatus.UPLOADING,
        mimeType: resolved.mimeType,
        fileSize: dto.fileSize,
        s3Key: '', // placeholder, set after key is built
        defaultDurationSeconds,
        documentFormat: resolved.documentFormat,
        uploadedById: actor.userId,
      },
    });

    const s3Key = this.s3.buildAssetKey(organizationId, asset.id, dto.filename);

    const updatedAsset = await this.prisma.asset.update({
      where: { id: asset.id },
      data: { s3Key },
    });

    const uploadUrl = this.s3.useLocalStorage
      ? this.s3.buildLocalUploadUrl(organizationId, asset.id)
      : await this.s3.generateUploadUrl(s3Key, resolved.mimeType);

    return {
      asset: await this.enrichAssetResponse(updatedAsset),
      uploadUrl,
    };
  }

  async receiveUpload(
    actor: RequestActor,
    organizationId: string,
    assetId: string,
    data: Buffer,
  ) {
    this.ensureOrganizationAccess(actor, organizationId);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.type === AssetType.URL) {
      throw new BadRequestException('URL assets cannot be uploaded as files');
    }

    if (!asset.s3Key) {
      throw new BadRequestException('Asset is missing storage key');
    }

    if (asset.status !== AssetStatus.UPLOADING) {
      throw new BadRequestException('Asset is not awaiting upload');
    }

    await this.s3.saveLocalFile(asset.s3Key, data);
    return { success: true };
  }

  async confirmUpload(actor: RequestActor, organizationId: string, assetId: string) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.type === AssetType.URL) {
      throw new BadRequestException('URL assets do not require upload confirmation');
    }

    if (!asset.s3Key) {
      throw new BadRequestException('Asset is missing storage key');
    }

    if (asset.status === AssetStatus.READY) {
      return this.enrichAssetResponse(asset);
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

    const thumbnailS3Key = asset.type === AssetType.IMAGE ? asset.s3Key : asset.thumbnailS3Key;

    const updatedAsset = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: AssetStatus.READY,
        fileSize: head.contentLength || asset.fileSize,
        contentHash: head.etag ?? null,
        contentVersion: { increment: 1 },
        thumbnailS3Key,
      },
    });

    await this.playlistSync.bumpPlaylistsForAsset(assetId);

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.uploaded',
      targetType: 'asset',
      targetId: assetId,
      summary: `${actor.email} uploaded ${asset.name}`,
      metadata: { filename: asset.name, type: asset.type, fileSize: updatedAsset.fileSize },
    });

    return this.enrichAssetResponse(updatedAsset);
  }

  async listAssets(
    actor: RequestActor,
    organizationId: string,
    filters: {
      type?: string;
      search?: string;
      page?: number;
      limit?: number;
      folderId?: string | null;
      scope?: 'folder' | 'all';
    },
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

    // Folder scoping: when scope is 'all' (or a global search is in progress) we return
    // assets from every folder. Otherwise we restrict to the requested folder, where an
    // omitted/null folderId means the root (unfiled) assets.
    const scopeAll = filters.scope === 'all' || Boolean(filters.search);
    if (!scopeAll) {
      where.folderId = filters.folderId ?? null;
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
      assets.map((asset) => this.enrichAssetResponse(asset)),
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

    return this.enrichAssetResponse(asset);
  }

  async deleteAsset(actor: RequestActor, organizationId: string, assetId: string) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

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

    // Bump playlists that reference this asset
    await this.playlistSync.bumpPlaylistsForAsset(assetId);

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
    this.assertCanEdit(actor);

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

    return this.enrichAssetResponse(updated);
  }

  async updateAsset(actor: RequestActor, organizationId: string, assetId: string, dto: UpdateAssetDto) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.tags !== undefined) {
      data.tags = dto.tags;
    }
    if (dto.folderId !== undefined) {
      data.folderId = await this.resolveFolderId(organizationId, dto.folderId);
    }
    if (dto.defaultDurationSeconds !== undefined) {
      if (dto.defaultDurationSeconds < 1) {
        throw new BadRequestException('Duration must be at least 1 second');
      }
      data.defaultDurationSeconds = dto.defaultDurationSeconds;
    }

    if (Object.keys(data).length === 0) {
      return this.enrichAssetResponse(asset);
    }

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data,
    });

    if (dto.defaultDurationSeconds !== undefined) {
      await this.playlistSync.bumpPlaylistsForAsset(assetId);
    }

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.updated',
      targetType: 'asset',
      targetId: assetId,
      summary: `${actor.email} updated asset ${updated.name}`,
      metadata: { folderId: updated.folderId ?? null, defaultDurationSeconds: updated.defaultDurationSeconds },
    });

    return this.enrichAssetResponse(updated);
  }

  // --- Folders ---------------------------------------------------------------

  async listFolders(
    actor: RequestActor,
    organizationId: string,
    parentId: string | null,
  ) {
    this.ensureOrganizationAccess(actor, organizationId);

    if (parentId) {
      await this.getFolderOrThrow(organizationId, parentId);
    }

    const folders = await this.prisma.assetFolder.findMany({
      where: { organizationId, parentId: parentId ?? null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { children: true, assets: true } },
      },
    });

    const breadcrumbs = await this.buildBreadcrumbs(organizationId, parentId);

    return {
      currentFolderId: parentId ?? null,
      breadcrumbs,
      folders: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        subfolderCount: folder._count.children,
        assetCount: folder._count.assets,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      })),
    };
  }

  async createFolder(actor: RequestActor, organizationId: string, dto: CreateFolderDto) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Folder name is required');
    }

    const parentId = dto.parentId ?? null;
    if (parentId) {
      await this.getFolderOrThrow(organizationId, parentId);
    }

    await this.assertFolderNameAvailable(organizationId, parentId, name);

    const folder = await this.prisma.assetFolder.create({
      data: { organizationId, name, parentId },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.folder.created',
      targetType: 'assetFolder',
      targetId: folder.id,
      summary: `${actor.email} created folder ${folder.name}`,
      metadata: { parentId },
    });

    return this.formatFolder(folder);
  }

  async updateFolder(
    actor: RequestActor,
    organizationId: string,
    folderId: string,
    dto: UpdateFolderDto,
  ) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

    const folder = await this.getFolderOrThrow(organizationId, folderId);

    const nextName = dto.name !== undefined ? dto.name.trim() : folder.name;
    if (dto.name !== undefined && !nextName) {
      throw new BadRequestException('Folder name cannot be empty');
    }

    let nextParentId = folder.parentId;
    if (dto.parentId !== undefined) {
      nextParentId = dto.parentId ?? null;
      if (nextParentId) {
        if (nextParentId === folderId) {
          throw new BadRequestException('A folder cannot be its own parent');
        }
        await this.getFolderOrThrow(organizationId, nextParentId);
        await this.assertNotDescendant(organizationId, folderId, nextParentId);
      }
    }

    const nameChanged = nextName !== folder.name;
    const parentChanged = nextParentId !== folder.parentId;
    if (nameChanged || parentChanged) {
      await this.assertFolderNameAvailable(organizationId, nextParentId, nextName, folderId);
    }

    const updated = await this.prisma.assetFolder.update({
      where: { id: folderId },
      data: { name: nextName, parentId: nextParentId },
    });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.folder.updated',
      targetType: 'assetFolder',
      targetId: folderId,
      summary: `${actor.email} updated folder ${updated.name}`,
      metadata: { name: updated.name, parentId: updated.parentId },
    });

    return this.formatFolder(updated);
  }

  async deleteFolder(actor: RequestActor, organizationId: string, folderId: string) {
    this.ensureOrganizationAccess(actor, organizationId);
    this.assertCanEdit(actor);

    const folder = await this.getFolderOrThrow(organizationId, folderId);

    // Deleting a folder cascades to its subfolders (DB-level onDelete: Cascade).
    // Assets within the folder (and any descendant folders) are preserved: their
    // folderId is set to null via onDelete: SetNull, so they move to the root.
    await this.prisma.assetFolder.delete({ where: { id: folderId } });

    await this.auditService.log({
      actorUserId: actor.userId,
      organizationId,
      action: 'asset.folder.deleted',
      targetType: 'assetFolder',
      targetId: folderId,
      summary: `${actor.email} deleted folder ${folder.name}`,
      metadata: { parentId: folder.parentId },
    });

    return { success: true };
  }

  private async resolveFolderId(
    organizationId: string,
    folderId: string | null | undefined,
  ): Promise<string | null> {
    if (folderId === null || folderId === undefined || folderId === '') {
      return null;
    }
    await this.getFolderOrThrow(organizationId, folderId);
    return folderId;
  }

  private async getFolderOrThrow(organizationId: string, folderId: string) {
    const folder = await this.prisma.assetFolder.findFirst({
      where: { id: folderId, organizationId },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }

  private async assertFolderNameAvailable(
    organizationId: string,
    parentId: string | null,
    name: string,
    excludeFolderId?: string,
  ) {
    const conflict = await this.prisma.assetFolder.findFirst({
      where: {
        organizationId,
        parentId: parentId ?? null,
        name,
        ...(excludeFolderId ? { id: { not: excludeFolderId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new BadRequestException('A folder with this name already exists here');
    }
  }

  private async assertNotDescendant(
    organizationId: string,
    folderId: string,
    candidateParentId: string,
  ) {
    let cursor: string | null = candidateParentId;
    while (cursor) {
      if (cursor === folderId) {
        throw new BadRequestException('Cannot move a folder into one of its own subfolders');
      }
      const parent: { parentId: string | null } | null = await this.prisma.assetFolder.findFirst({
        where: { id: cursor, organizationId },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }

  private async buildBreadcrumbs(organizationId: string, folderId: string | null) {
    const breadcrumbs: { id: string; name: string }[] = [];
    let cursor: string | null = folderId;
    while (cursor) {
      const folder: { id: string; name: string; parentId: string | null } | null =
        await this.prisma.assetFolder.findFirst({
          where: { id: cursor, organizationId },
          select: { id: true, name: true, parentId: true },
        });
      if (!folder) break;
      breadcrumbs.unshift({ id: folder.id, name: folder.name });
      cursor = folder.parentId;
    }
    return breadcrumbs;
  }

  private formatFolder(folder: {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      subfolderCount: 0,
      assetCount: 0,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  private async resolveAssetDownloadUrl(asset: {
    type: AssetType;
    status: AssetStatus;
    s3Key: string | null;
  }) {
    if (asset.type === AssetType.URL) return null;
    if (asset.status !== AssetStatus.READY || !asset.s3Key) return null;
    return this.s3.generateDownloadUrl(asset.s3Key);
  }

  private assertCanEdit(actor: RequestActor) {
    if (!actor.organization) return;
    if (actor.organization.role === 'ANALYST_VIEWER') {
      throw new ForbiddenException('Read-only access');
    }
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

  private async enrichAssetResponse(asset: Record<string, unknown>) {
    const typed = asset as {
      type: AssetType;
      status: AssetStatus;
      s3Key: string | null;
      url: string | null;
      thumbnailS3Key?: string | null;
      documentFormat?: string | null;
      defaultDurationSeconds?: number | null;
    };

    const downloadUrl = await this.resolveAssetDownloadUrl(typed);
    const thumbnailUrl = await this.resolveAssetThumbnailUrl(typed);
    const fileUrl = typed.type === AssetType.URL ? typed.url : downloadUrl;

    return {
      ...this.formatAsset(asset),
      downloadUrl,
      thumbnailUrl,
      fileUrl,
      previewKind: getPreviewKind(typed.type, typed.documentFormat ?? null),
      durationSeconds: typed.defaultDurationSeconds ?? null,
    };
  }

  private async resolveAssetThumbnailUrl(asset: {
    type: AssetType;
    status: AssetStatus;
    s3Key: string | null;
    thumbnailS3Key?: string | null;
  }) {
    if (asset.status !== AssetStatus.READY) return null;
    const key = asset.thumbnailS3Key ?? (asset.type === AssetType.IMAGE ? asset.s3Key : null);
    if (!key) return null;
    return this.s3.generateDownloadUrl(key);
  }

  private formatAsset(asset: Record<string, unknown>) {
    return {
      id: asset.id,
      organizationId: asset.organizationId,
      folderId: asset.folderId ?? null,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      url: asset.url ?? null,
      defaultDurationSeconds: asset.defaultDurationSeconds ?? null,
      documentFormat: asset.documentFormat ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      durationMs: asset.durationMs ?? null,
      tags: asset.tags ?? [],
      contentVersion: asset.contentVersion ?? 1,
      contentHash: asset.contentHash ?? null,
      uploadedBy: asset.uploadedBy ?? null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }
}
