import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DeviceCacheCommandStatus,
  DeviceCacheCommandType,
  DeviceCacheDownloadStatus,
  DeviceCacheLocalStatus,
  DeviceStatus,
  DeviceSyncReportStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CacheReportDto } from '../player/dto/cache-report.dto';

@Injectable()
export class DeviceCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestCacheReport(deviceId: string, organizationId: string, report: CacheReportDto) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId, isPaired: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    const syncStatus = this.parseSyncStatus(report.syncStatus);
    const now = new Date();
    // Playlist slots can list the same asset twice — cache is per file, not per slot.
    const assets = this.dedupeCacheAssets(report.assets ?? []);

    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: {
          cachePlaylistName: report.currentPlaylistName ?? report.currentPlaylistId ?? null,
          cachePlaylistVersion: report.playlistVersion ?? null,
          cacheLayoutName: report.currentLayoutName ?? report.currentLayoutId ?? null,
          cacheLayoutVersion: report.layoutVersion ?? null,
          cacheTotalBytes: report.cacheTotalBytes ?? 0,
          cacheUsedBytes: report.cacheUsedBytes ?? 0,
          cacheStorageTotalBytes: report.storageTotalBytes ?? 0,
          cachedAssetCount: report.cachedAssetCount ?? assets.length,
          expectedAssetCount: report.expectedAssetCount ?? assets.length,
          pendingDownloadCount: report.pendingDownloadCount ?? 0,
          cacheLastReportedAt: now,
          lastSeenAt: now,
          status: DeviceStatus.ONLINE,
          lastSuccessfulSyncAt: report.lastSuccessfulSyncAt
            ? new Date(report.lastSuccessfulSyncAt)
            : syncStatus === DeviceSyncReportStatus.OK
              ? now
              : undefined,
          lastFailedSyncAt: report.lastFailedSyncAt
            ? new Date(report.lastFailedSyncAt)
            : syncStatus === DeviceSyncReportStatus.FAILED
              ? now
              : undefined,
          lastSyncError: report.lastSyncError ?? null,
          syncReportStatus: syncStatus,
        },
      });

      const reportedAssetIds = assets.map((asset) => asset.assetId);
      await tx.deviceCachedAsset.deleteMany({
        where: {
          deviceId,
          ...(reportedAssetIds.length ? { assetId: { notIn: reportedAssetIds } } : {}),
        },
      });

      if (assets.length) {
        const maxDownloadedAt = assets
          .map((a) => (a.downloadedAt ? new Date(a.downloadedAt).getTime() : 0))
          .reduce((max, t) => Math.max(max, t), 0);

        for (const asset of assets) {
          const row = {
            assetName: asset.assetName,
            assetType: asset.assetType,
            mimeType: asset.mimeType ?? '',
            playlistId: asset.playlistId ?? null,
            playlistName: asset.playlistName ?? null,
            fileSize: asset.fileSize ?? 0,
            assetVersion: asset.assetVersion ?? 1,
            contentHash: asset.contentHash ?? null,
            downloadStatus: this.parseDownloadStatus(asset.downloadStatus),
            localCacheStatus: this.parseLocalStatus(asset.localCacheStatus),
            downloadedAt: asset.downloadedAt ? new Date(asset.downloadedAt) : null,
          };

          await tx.deviceCachedAsset.upsert({
            where: {
              deviceId_assetId: { deviceId, assetId: asset.assetId },
            },
            create: {
              deviceId,
              assetId: asset.assetId,
              ...row,
            },
            update: row,
          });
        }

        if (maxDownloadedAt > 0) {
          await tx.device.update({
            where: { id: deviceId },
            data: { lastDownloadAt: new Date(maxDownloadedAt) },
          });
        }
      }

      if (report.completedCommandId) {
        await tx.deviceCacheCommand.updateMany({
          where: {
            id: report.completedCommandId,
            deviceId,
            status: { in: [DeviceCacheCommandStatus.PENDING, DeviceCacheCommandStatus.ACKNOWLEDGED] },
          },
          data: {
            status: report.commandFailed ? DeviceCacheCommandStatus.FAILED : DeviceCacheCommandStatus.COMPLETED,
            completedAt: now,
            errorMessage: report.commandError ?? null,
          },
        });
      }

      // Successful inventory report that matches assigned content clears syncRequired.
      await this.ackContentRevisionFromCacheReport(tx, device, report);
    });

    return { received: true };
  }

  /**
   * Collapse duplicate assetIds (same file in multiple playlist slots) to one row.
   * Later entries win so the newest download/local status is kept.
   */
  private dedupeCacheAssets(assets: CacheReportDto['assets']) {
    const byId = new Map<string, (typeof assets)[number]>();
    for (const asset of assets) {
      if (!asset?.assetId) continue;
      byId.set(asset.assetId, asset);
    }
    return [...byId.values()];
  }

  private async ackContentRevisionFromCacheReport(
    tx: Prisma.TransactionClient,
    device: {
      id: string;
      currentPlaylistId: string | null;
      currentLayoutId: string | null;
      pendingInitialSync: boolean;
    },
    report: CacheReportDto,
  ) {
    const pendingDownloads = report.pendingDownloadCount ?? 0;
    if (pendingDownloads > 0) return;
    if (report.syncStatus && this.parseSyncStatus(report.syncStatus) === DeviceSyncReportStatus.FAILED) {
      return;
    }

    if (report.layoutVersion != null) {
      const layoutId = report.currentLayoutId ?? device.currentLayoutId;
      if (layoutId) {
        const layout = await tx.layout.findFirst({
          where: { id: layoutId },
          select: { id: true, syncVersion: true },
        });
        if (layout && layout.syncVersion === report.layoutVersion) {
          await tx.device.update({
            where: { id: device.id },
            data: {
              lastAckedLayoutVersion: layout.syncVersion,
              lastAckedPlaylistVersion: null,
              lastAckedPlaylistId: null,
              ...(device.pendingInitialSync
                ? { pendingInitialSync: false, initialSyncRequestedAt: null }
                : {}),
            },
          });
          return;
        }
      }
    }

    if (report.playlistVersion == null) return;

    const playlistId = report.currentPlaylistId ?? device.currentPlaylistId;
    if (!playlistId) return;

    const playlist = await tx.playlist.findFirst({
      where: { id: playlistId },
      select: { id: true, syncVersion: true },
    });
    if (!playlist || playlist.syncVersion !== report.playlistVersion) return;

    await tx.device.update({
      where: { id: device.id },
      data: {
        lastAckedPlaylistVersion: playlist.syncVersion,
        lastAckedPlaylistId: playlist.id,
        ...(device.pendingInitialSync
          ? { pendingInitialSync: false, initialSyncRequestedAt: null }
          : {}),
      },
    });
  }

  async deliverPendingCommand(deviceId: string) {
    const command = await this.prisma.deviceCacheCommand.findFirst({
      where: { deviceId, status: DeviceCacheCommandStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });

    if (!command) return null;

    await this.prisma.deviceCacheCommand.update({
      where: { id: command.id },
      data: { status: DeviceCacheCommandStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
    });

    return {
      id: command.id,
      command: command.command,
    };
  }

  async getCacheStatus(deviceId: string, organizationId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId, isPaired: true },
      include: {
        currentPlaylist: { select: { id: true, name: true, syncVersion: true } },
        currentLayout: { select: { id: true, name: true, syncVersion: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');

    return this.serializeCacheStatus(device);
  }

  async getCachedAssets(deviceId: string, organizationId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId, isPaired: true },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    const assets = await this.prisma.deviceCachedAsset.findMany({
      where: { deviceId },
      orderBy: [{ playlistName: 'asc' }, { assetName: 'asc' }],
    });

    return assets.map((asset) => this.serializeCachedAsset(asset));
  }

  async queueCommand(
    deviceId: string,
    organizationId: string,
    command: DeviceCacheCommandType,
    requestedById?: string,
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId, isPaired: true },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.deviceCacheCommand.updateMany({
      where: {
        deviceId,
        status: DeviceCacheCommandStatus.PENDING,
      },
      data: {
        status: DeviceCacheCommandStatus.FAILED,
        completedAt: new Date(),
        errorMessage: 'Superseded by a newer cache command',
      },
    });

    const created = await this.prisma.deviceCacheCommand.create({
      data: {
        deviceId,
        command,
        requestedById: requestedById ?? null,
      },
    });

    return {
      commandId: created.id,
      command: created.command,
      status: created.status,
      message: this.commandMessage(created.command),
    };
  }

  serializeCacheStatus(device: {
    id: string;
    name: string;
    status: string;
    lastSync: string;
    cachePlaylistName: string | null;
    cachePlaylistVersion: number | null;
    cacheLayoutName: string | null;
    cacheLayoutVersion: number | null;
    cacheTotalBytes: number;
    cacheUsedBytes: number;
    cacheStorageTotalBytes: number;
    cachedAssetCount: number;
    expectedAssetCount: number;
    pendingDownloadCount: number;
    cacheLastReportedAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
    lastFailedSyncAt: Date | null;
    lastSyncError: string | null;
    syncReportStatus: DeviceSyncReportStatus | null;
    lastAckedPlaylistVersion: number | null;
    lastAckedLayoutVersion: number | null;
    currentPlaylist?: { id: string; name: string; syncVersion: number } | null;
    currentLayout?: { id: string; name: string; syncVersion: number } | null;
  }) {
    const assignedPlaylist = device.currentPlaylist?.name ?? null;
    const assignedLayout = device.currentLayout?.name ?? null;
    const currentContentName = assignedLayout ?? assignedPlaylist ?? 'Unassigned';
    const currentContentVersion =
      device.currentLayout?.syncVersion ??
      device.currentPlaylist?.syncVersion ??
      device.cacheLayoutVersion ??
      device.cachePlaylistVersion ??
      null;

    return {
      deviceId: device.id,
      deviceName: device.name,
      deviceStatus: device.status.toLowerCase(),
      offlineCache: {
        currentPlaylist: device.cachePlaylistName ?? assignedPlaylist ?? currentContentName,
        currentLayout: device.cacheLayoutName ?? assignedLayout,
        playlistVersion: device.cachePlaylistVersion ?? device.lastAckedPlaylistVersion,
        layoutVersion: device.cacheLayoutVersion ?? device.lastAckedLayoutVersion,
        assignedContentVersion: currentContentVersion,
        lastSyncTime: device.cacheLastReportedAt?.toISOString() ?? device.lastSync,
        totalCacheBytes: device.cacheTotalBytes,
        cachedAssetCount: device.cachedAssetCount,
        expectedAssetCount: device.expectedAssetCount,
        storageUsedBytes: device.cacheUsedBytes,
        storageTotalBytes: device.cacheStorageTotalBytes,
        pendingDownloads: device.pendingDownloadCount,
        reportAgeSeconds: device.cacheLastReportedAt
          ? Math.floor((Date.now() - device.cacheLastReportedAt.getTime()) / 1000)
          : null,
      },
      syncStatus: {
        online: device.status !== DeviceStatus.OFFLINE,
        lastSuccessfulSync: device.lastSuccessfulSyncAt?.toISOString() ?? null,
        lastFailedSync: device.lastFailedSyncAt?.toISOString() ?? null,
        lastSyncError: device.lastSyncError,
        pendingDownloads: device.pendingDownloadCount,
        reportStatus: device.syncReportStatus?.toLowerCase() ?? 'unknown',
      },
    };
  }

  serializeCachedAsset(asset: {
    id: string;
    assetId: string;
    assetName: string;
    assetType: string;
    mimeType: string;
    playlistId: string | null;
    playlistName: string | null;
    fileSize: number;
    assetVersion: number;
    contentHash: string | null;
    downloadStatus: DeviceCacheDownloadStatus;
    localCacheStatus: DeviceCacheLocalStatus;
    downloadedAt: Date | null;
  }) {
    return {
      id: asset.id,
      assetId: asset.assetId,
      assetName: asset.assetName,
      assetType: asset.assetType,
      mimeType: asset.mimeType,
      playlistId: asset.playlistId,
      playlist: asset.playlistName ?? '—',
      fileSize: asset.fileSize,
      fileSizeLabel: this.formatBytes(asset.fileSize),
      assetVersion: asset.assetVersion,
      contentHash: asset.contentHash,
      downloadStatus: asset.downloadStatus.toLowerCase(),
      localCacheStatus: asset.localCacheStatus.toLowerCase(),
      downloadedAt: asset.downloadedAt?.toISOString() ?? null,
    };
  }

  formatBytes(bytes: number) {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  private commandMessage(command: DeviceCacheCommandType) {
    const messages: Partial<Record<DeviceCacheCommandType, string>> = {
      [DeviceCacheCommandType.FORCE_SYNC]: 'Force sync queued. The player will sync on its next heartbeat.',
      [DeviceCacheCommandType.CLEAR_CACHE]: 'Clear cache queued. The player will wipe local files on its next poll.',
      [DeviceCacheCommandType.REDOWNLOAD_PLAYLIST]: 'Redownload playlist queued. The player will refresh all assigned assets.',
      [DeviceCacheCommandType.RESTART_PLAYER]: 'Restart player queued. The player app will restart on its next poll.',
      [DeviceCacheCommandType.RESTART_DEVICE]: 'Restart device queued. The device will reboot on its next poll.',
      [DeviceCacheCommandType.UPLOAD_LOGS]: 'Upload logs queued. The player will send system logs on its next poll.',
      [DeviceCacheCommandType.TAKE_SCREENSHOT]: 'Screenshot queued. The player will capture and upload on its next poll.',
      [DeviceCacheCommandType.REFRESH_STATUS]: 'Refresh status queued. The player will report full telemetry on its next poll.',
    };
    return messages[command] ?? 'Remote command queued.';
  }

  private parseSyncStatus(value?: string): DeviceSyncReportStatus | null {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'OK') return DeviceSyncReportStatus.OK;
    if (normalized === 'PARTIAL') return DeviceSyncReportStatus.PARTIAL;
    if (normalized === 'FAILED') return DeviceSyncReportStatus.FAILED;
    return null;
  }

  private parseDownloadStatus(value?: string): DeviceCacheDownloadStatus {
    const normalized = (value ?? 'PENDING').trim().toUpperCase();
    if (normalized === 'DOWNLOADED') return DeviceCacheDownloadStatus.DOWNLOADED;
    if (normalized === 'FAILED') return DeviceCacheDownloadStatus.FAILED;
    return DeviceCacheDownloadStatus.PENDING;
  }

  private parseLocalStatus(value?: string): DeviceCacheLocalStatus {
    const normalized = (value ?? 'MISSING').trim().toUpperCase();
    if (normalized === 'PRESENT') return DeviceCacheLocalStatus.PRESENT;
    if (normalized === 'CORRUPT') return DeviceCacheLocalStatus.CORRUPT;
    return DeviceCacheLocalStatus.MISSING;
  }
}
