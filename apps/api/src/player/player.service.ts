import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Device, DeviceStatus, ProofOfPlayStatus, TickerBroadcastScope, TickerStatus, ZoneType } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  enrichPopLogFields,
  expandPopLogPlaybackEvents,
  PopLogContextIndex,
} from '../common/pop-log-enrichment';
import { formatPlaylistOrderLog, sortPlaylistAssetsBySequence } from '../common/playlist-order';
import { DeviceCacheService } from '../device-cache/device-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import type { CacheReportDto } from './dto/cache-report.dto';
import type { SyncQueryDto } from './dto/sync-query.dto';

/** Device resolved from a valid paired token — organizationId is guaranteed. */
type PairedDevice = Device & { organizationId: string };

/** Presigned URL lifetime for player sync downloads (7 days). */
const SYNC_DOWNLOAD_URL_TTL_SECONDS = 86400 * 7;

type SyncAssetContext = {
  knownAssetIds: string[];
  clientAssetVersions: Map<string, number>;
  recoverCache: boolean;
  missingAssetIds: Set<string>;
};

type ManifestAssetInput = {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  status: string;
  s3Key: string | null;
  url: string | null;
  fileSize: number;
  contentVersion: number;
  contentHash: string | null;
  updatedAt: Date;
  defaultDurationSeconds?: number | null;
};

type ManifestEntry = {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  durationSeconds: number;
  position: number;
  assetVersion: number;
  updatedAt: string;
  contentHash: string | null;
  status: string;
  available: boolean;
  unavailableReason: string | null;
  requiresDownload: boolean;
  downloadUrl: string | null;
  url: string | null;
  fileSize: number;
};

type ContentRevisionState = {
  revision: string;
  updatedAt: string | null;
  playlistVersion: number | null;
  layoutVersion: number | null;
};

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly deviceCache: DeviceCacheService,
  ) {}

  /**
   * Generate a random 6-character alphanumeric pairing code.
   */
  private generatePairingCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous chars (0, O, 1, I)
    let code = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  private generatePairingSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure device token (64-char hex string).
   */
  private generateDeviceToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async ensurePairingSecret(deviceId: string, existingSecret: string | null): Promise<string> {
    if (existingSecret) return existingSecret;
    const pairingSecret = this.generatePairingSecret();
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { pairingSecret },
    });
    return pairingSecret;
  }

  /**
   * Called by the Android player on first boot.
   * Creates (or updates) a draft Device with a pairing code.
   */
  async initPairing(hardwareId: string) {
    if (!hardwareId?.trim()) {
      throw new BadRequestException('hardwareId is required');
    }

    const trimmedId = hardwareId.trim();

    // Check if device already exists with this hardwareId
    const existing = await this.prisma.device.findUnique({
      where: { hardwareId: trimmedId },
    });

    if (existing) {
      // Already paired — return token info
      if (existing.isPaired && existing.deviceToken) {
        return {
          hardwareId: trimmedId,
          isPaired: true,
          pairingCode: null,
          pairingSecret: null,
        };
      }

      // Already has a pending pairing code — return it
      if (existing.pairingCode) {
        const pairingSecret = await this.ensurePairingSecret(existing.id, existing.pairingSecret);
        return {
          hardwareId: trimmedId,
          isPaired: false,
          pairingCode: existing.pairingCode,
          pairingSecret,
        };
      }

      // Regenerate code (e.g. previous code consumed without completing pair)
      const pairingCode = await this.getUniquePairingCode();
      const pairingSecret = this.generatePairingSecret();
      await this.prisma.device.update({
        where: { id: existing.id },
        data: {
          pairingCode,
          pairingSecret,
          isPaired: false,
          deviceToken: null,
        },
      });

      return {
        hardwareId: trimmedId,
        isPaired: false,
        pairingCode,
        pairingSecret,
      };
    }

    // Create a new draft device
    const pairingCode = await this.getUniquePairingCode();
    const pairingSecret = this.generatePairingSecret();
    await this.prisma.device.create({
      data: {
        hardwareId: trimmedId,
        name: `Device-${trimmedId.slice(0, 8)}`,
        pairingCode,
        pairingSecret,
        isPaired: false,
        status: DeviceStatus.OFFLINE,
      },
    });

    this.logger.log(`Init pairing for hardwareId=${trimmedId}, code=${pairingCode}`);

    return {
      hardwareId: trimmedId,
      isPaired: false,
      pairingCode,
      pairingSecret,
    };
  }

  /**
   * Generate a unique pairing code (retry on collision).
   */
  private async getUniquePairingCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.generatePairingCode();
      const existing = await this.prisma.device.findUnique({
        where: { pairingCode: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Unable to generate a unique pairing code. Please try again.');
  }

  /**
   * Polled by the Android player to check if pairing is complete.
   * Requires pairingSecret from init-pairing to prevent token theft.
   */
  async getPairingStatus(hardwareId: string, pairingSecret: string | undefined) {
    const trimmedId = hardwareId?.trim();
    if (!trimmedId) {
      throw new BadRequestException('hardwareId is required');
    }

    const device = await this.prisma.device.findUnique({
      where: { hardwareId: trimmedId },
    });

    if (!device) {
      throw new NotFoundException('Unknown device. Call init-pairing first.');
    }

    if (!pairingSecret?.trim()) {
      throw new UnauthorizedException('pairingSecret is required');
    }

    if (!device.pairingSecret || device.pairingSecret !== pairingSecret.trim()) {
      throw new UnauthorizedException('Invalid pairing secret');
    }

    if (device.isPaired && device.deviceToken && device.organizationId) {
      return {
        isPaired: true,
        deviceToken: device.deviceToken,
        organizationId: device.organizationId,
        deviceName: device.name,
      };
    }

    return {
      isPaired: false,
      deviceToken: null,
      organizationId: null,
      deviceName: null,
    };
  }

  /**
   * Resolve a device from its device token (used by heartbeat, sync, pop-logs).
   * Draft/unpaired devices are rejected — only paired devices with an organization may call player APIs.
   */
  private async resolveDeviceByToken(authHeader: string | undefined): Promise<PairedDevice> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing device token');
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const device = await this.prisma.device.findUnique({
      where: { deviceToken: token },
    });

    if (!device || !device.isPaired || !device.organizationId) {
      throw new UnauthorizedException('Invalid or unpaired device token');
    }

    return { ...device, organizationId: device.organizationId };
  }

  /**
   * Receive heartbeat telemetry from a device.
   */
  async heartbeat(
    authHeader: string | undefined,
    data: { cpu: number; ram: number; temp: number; currentContent?: string },
  ) {
    const device = await this.resolveDeviceByToken(authHeader);
    const contentRevision = await this.getDeviceContentRevision(device);

    const nextStatus =
      data.cpu > 85 || data.temp > 80
        ? DeviceStatus.WARNING
        : DeviceStatus.ONLINE;

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        cpu: data.cpu,
        ram: data.ram,
        temp: data.temp,
        status: nextStatus,
        lastSync: new Date().toISOString(),
        uptime: this.calculateUptime(device.createdAt),
        ...(data.currentContent ? { currentContent: data.currentContent } : {}),
      },
    });

    const syncRequired = this.computeSyncRequired(device, contentRevision);

    return {
      status: 'ok',
      contentRevision: contentRevision.revision,
      syncRequired,
    };
  }

  /**
   * Lightweight revision check polled by Android every ~5 seconds.
   * Changes whenever the assigned playlist or layout manifest is bumped.
   */
  async getSyncRevision(authHeader: string | undefined) {
    const device = await this.resolveDeviceByToken(authHeader);
    const contentRevision = await this.getDeviceContentRevision(device);

    return {
      revision: contentRevision.revision,
      updatedAt: contentRevision.updatedAt,
    };
  }

  /**
   * Return the active playlist manifest with incremental sync support.
   * Skips the manifest only when the client reports a matching playlist version
   * and already has the current assets cached locally.
   */
  async syncPlaylist(authHeader: string | undefined, query: SyncQueryDto = {}) {
    const device = await this.resolveDeviceByToken(authHeader);
    const syncContext = this.buildSyncAssetContext(query);

    const payload = device.currentLayoutId
      ? await this.syncLayout(device, query, syncContext)
      : await this.buildPlaylistSyncResponse(device, query, syncContext);

    return {
      ...payload,
      cacheCommand: (await this.deviceCache.deliverPendingCommand(device.id)) ?? null,
    };
  }

  async reportCache(authHeader: string | undefined, report: CacheReportDto) {
    const device = await this.resolveDeviceByToken(authHeader);
    return this.deviceCache.ingestCacheReport(device.id, device.organizationId, report);
  }

  private async buildPlaylistSyncResponse(
    device: PairedDevice,
    query: SyncQueryDto,
    syncContext: SyncAssetContext,
  ) {
    const tickers = await this.fetchActiveTickers(device.organizationId, device.id);

    if (!device.currentPlaylistId) {
      const removedAssetIds = syncContext.knownAssetIds;
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSync: new Date().toISOString(), lastAckedPlaylistVersion: null },
      });
      return {
        unchanged: false,
        playlistVersion: null,
        playlist: null,
        assets: [],
        currentAssetIds: [],
        removedAssetIds,
        tickers,
      };
    }

    const playlist = await this.prisma.playlist.findUnique({
      where: { id: device.currentPlaylistId },
      include: {
        playlistAssets: {
          orderBy: [{ position: 'asc' }, { assetId: 'asc' }],
          include: { asset: true },
        },
      },
    });

    if (!playlist) {
      const removedAssetIds = syncContext.knownAssetIds;
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSync: new Date().toISOString(), lastAckedPlaylistVersion: null },
      });
      return {
        unchanged: false,
        playlistVersion: null,
        playlist: null,
        assets: [],
        currentAssetIds: [],
        removedAssetIds,
        tickers,
      };
    }

    if (playlist.organizationId !== device.organizationId) {
      throw new ForbiddenException('Playlist does not belong to this device organization');
    }

    const manifest = await this.buildPlaylistManifest(playlist, syncContext);
    const currentAssetIds = manifest.map((entry) => entry.id);
    const removedAssetIds = syncContext.knownAssetIds.filter((id) => !currentAssetIds.includes(id));

    const clientReportedVersion = query.playlistVersion;
    const playlistVersionMatches =
      clientReportedVersion !== undefined && clientReportedVersion === playlist.syncVersion;
    const clientMissingAssets = currentAssetIds.some((id) => !syncContext.knownAssetIds.includes(id));
    const clientHasPendingDownloads = manifest.some((entry) => entry.requiresDownload);
    const contentUnchanged =
      playlistVersionMatches &&
      syncContext.knownAssetIds.length > 0 &&
      !clientMissingAssets &&
      !clientHasPendingDownloads &&
      !syncContext.recoverCache &&
      syncContext.missingAssetIds.size === 0;

    const shouldAckPlaylistVersion =
      contentUnchanged ||
      (clientReportedVersion !== undefined && clientReportedVersion === playlist.syncVersion);

    const assignedDeviceCount = await this.prisma.device.count({
      where: { currentPlaylistId: playlist.id },
    });

    this.logger.log(
      `Playlist sync playlistId=${playlist.id} deviceId=${device.id} ` +
        `playlistVersion=${playlist.syncVersion} assetCount=${manifest.length} ` +
        `previousVersion=${clientReportedVersion ?? 'none'} newVersion=${playlist.syncVersion} ` +
        `updatedAt=${playlist.updatedAt.toISOString()} ` +
        `deviceCount=${assignedDeviceCount} unchanged=${contentUnchanged} ` +
        `returnedOrder=${formatPlaylistOrderLog(manifest)}`,
    );

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSync: new Date().toISOString(),
        ...(shouldAckPlaylistVersion ? { lastAckedPlaylistVersion: playlist.syncVersion } : {}),
      },
    });

    return {
      unchanged: contentUnchanged,
      playlistVersion: playlist.syncVersion,
      updatedAt: playlist.updatedAt.toISOString(),
      playlist: { id: playlist.id, name: playlist.name },
      assets: manifest,
      currentAssetIds,
      removedAssetIds,
      tickers,
    };
  }

  private async syncLayout(
    device: PairedDevice,
    query: SyncQueryDto,
    syncContext: SyncAssetContext,
  ) {
    const { knownAssetIds } = syncContext;
    const activeTickers = await this.fetchActiveTickers(device.organizationId, device.id);
    const primaryTicker = activeTickers[0] ?? null;

    const layout = await this.prisma.layout.findUnique({
      where: { id: device.currentLayoutId! },
      include: {
        zones: {
          orderBy: { zIndex: 'asc' },
          include: {
            playlist: {
              include: {
                playlistAssets: {
                  orderBy: [{ position: 'asc' }, { assetId: 'asc' }],
                  include: { asset: true },
                },
              },
            },
            asset: true,
          },
        },
      },
    });

    if (!layout || layout.organizationId !== device.organizationId) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSync: new Date().toISOString(), lastAckedLayoutVersion: null },
      });
      return {
        unchanged: false,
        layoutVersion: null,
        layout: null,
        playlistVersion: null,
        playlist: null,
        assets: [],
        currentAssetIds: [],
        removedAssetIds: knownAssetIds,
        tickers: [],
      };
    }

    const aggregatedAssets: ManifestEntry[] = [];
    const assetIndex = new Map<string, number>();
    const zoneManifests: {
      id: string;
      name: string;
      type: ZoneType;
      x: number;
      y: number;
      w: number;
      h: number;
      zIndex: number;
      playlistId?: string | null;
      playlistVersion?: number | null;
      playlistName?: string | null;
      assets?: ManifestEntry[];
      assetId?: string | null;
      asset?: ManifestEntry | null;
      ticker?: (typeof activeTickers)[number] | null;
    }[] = [];

    for (const zone of layout.zones) {
      if (zone.type === ZoneType.PLAYLIST && zone.playlist) {
        const assets = await this.buildPlaylistManifest(zone.playlist, syncContext);
        for (const asset of assets) {
          if (!assetIndex.has(asset.id)) {
            assetIndex.set(asset.id, aggregatedAssets.length);
            aggregatedAssets.push(asset);
          }
        }
        zoneManifests.push({
          id: zone.id,
          name: zone.name,
          type: zone.type,
          x: zone.x,
          y: zone.y,
          w: zone.w,
          h: zone.h,
          zIndex: zone.zIndex,
          playlistId: zone.playlist.id,
          playlistVersion: zone.playlist.syncVersion,
          playlistName: zone.playlist.name,
          assets,
        });
        continue;
      }

      if (zone.type === ZoneType.IMAGE && zone.asset) {
        const manifestEntry = await this.buildAssetManifestEntry(
          zone.asset,
          zone.asset.defaultDurationSeconds ?? 10,
          0,
          syncContext,
        );

        if (!assetIndex.has(manifestEntry.id)) {
          assetIndex.set(manifestEntry.id, aggregatedAssets.length);
          aggregatedAssets.push(manifestEntry);
        }

        zoneManifests.push({
          id: zone.id,
          name: zone.name,
          type: zone.type,
          x: zone.x,
          y: zone.y,
          w: zone.w,
          h: zone.h,
          zIndex: zone.zIndex,
          assetId: zone.assetId,
          asset: manifestEntry,
        });
        continue;
      }

      zoneManifests.push({
        id: zone.id,
        name: zone.name,
        type: zone.type,
        x: zone.x,
        y: zone.y,
        w: zone.w,
        h: zone.h,
        zIndex: zone.zIndex,
        ticker: zone.type === ZoneType.TICKER ? primaryTicker : null,
      });
    }

    const currentAssetIds = aggregatedAssets.map((entry) => entry.id);
    const removedAssetIds = knownAssetIds.filter((id) => !currentAssetIds.includes(id));
    const hasTickerZone = layout.zones.some((zone) => zone.type === ZoneType.TICKER);
    const clientReportedLayoutVersion = query.layoutVersion;
    const layoutVersionMatches =
      clientReportedLayoutVersion !== undefined && clientReportedLayoutVersion === layout.syncVersion;
    const clientMissingAssets = currentAssetIds.some((id) => !knownAssetIds.includes(id));
    const clientHasPendingDownloads = aggregatedAssets.some((entry) => entry.requiresDownload);
    const contentUnchanged =
      layoutVersionMatches &&
      knownAssetIds.length > 0 &&
      !clientMissingAssets &&
      !clientHasPendingDownloads &&
      !syncContext.recoverCache &&
      syncContext.missingAssetIds.size === 0;

    const shouldAckLayoutVersion =
      contentUnchanged ||
      (clientReportedLayoutVersion !== undefined && clientReportedLayoutVersion === layout.syncVersion);

    const assignedDeviceCount = await this.prisma.device.count({
      where: { currentLayoutId: layout.id },
    });

    this.logger.log(
      `Layout sync layoutId=${layout.id} deviceId=${device.id} ` +
        `previousVersion=${clientReportedLayoutVersion ?? 'none'} newVersion=${layout.syncVersion} ` +
        `updatedAt=${layout.updatedAt.toISOString()} assetsReturned=${aggregatedAssets.length} ` +
        `deviceCount=${assignedDeviceCount} unchanged=${contentUnchanged}`,
    );

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSync: new Date().toISOString(),
        ...(shouldAckLayoutVersion ? { lastAckedLayoutVersion: layout.syncVersion } : {}),
        ...(shouldAckLayoutVersion ? { lastAckedPlaylistVersion: null } : {}),
      },
    });

    const layoutPayload = {
      id: layout.id,
      name: layout.name,
      resolution: layout.resolution,
      zones: zoneManifests,
    };

    return {
      unchanged: contentUnchanged,
      layoutVersion: layout.syncVersion,
      updatedAt: layout.updatedAt.toISOString(),
      layout: layoutPayload,
      playlistVersion: null,
      playlist: null,
      assets: aggregatedAssets,
      currentAssetIds,
      removedAssetIds,
      tickers: hasTickerZone ? [] : activeTickers,
    };
  }

  private async getDeviceContentRevision(device: PairedDevice): Promise<ContentRevisionState> {
    if (device.currentLayoutId) {
      const layout = await this.prisma.layout.findUnique({
        where: { id: device.currentLayoutId },
        select: { id: true, syncVersion: true, updatedAt: true },
      });
      if (!layout) {
        return {
          revision: 'none',
          updatedAt: null,
          playlistVersion: null,
          layoutVersion: null,
        };
      }

      return {
        revision: `ly:${layout.id}:v${layout.syncVersion}:${layout.updatedAt.getTime()}`,
        updatedAt: layout.updatedAt.toISOString(),
        playlistVersion: null,
        layoutVersion: layout.syncVersion,
      };
    }

    if (device.currentPlaylistId) {
      const playlist = await this.prisma.playlist.findUnique({
        where: { id: device.currentPlaylistId },
        select: { id: true, syncVersion: true, updatedAt: true },
      });
      if (!playlist) {
        return {
          revision: 'none',
          updatedAt: null,
          playlistVersion: null,
          layoutVersion: null,
        };
      }

      return {
        revision: `pl:${playlist.id}:v${playlist.syncVersion}:${playlist.updatedAt.getTime()}`,
        updatedAt: playlist.updatedAt.toISOString(),
        playlistVersion: playlist.syncVersion,
        layoutVersion: null,
      };
    }

    return {
      revision: 'none',
      updatedAt: null,
      playlistVersion: null,
      layoutVersion: null,
    };
  }

  private computeSyncRequired(device: PairedDevice, content: ContentRevisionState): boolean {
    if (content.revision === 'none') return false;

    if (device.currentLayoutId) {
      return (
        content.layoutVersion != null &&
        (device.lastAckedLayoutVersion == null || device.lastAckedLayoutVersion !== content.layoutVersion)
      );
    }

    if (device.currentPlaylistId) {
      return (
        content.playlistVersion != null &&
        (device.lastAckedPlaylistVersion == null ||
          device.lastAckedPlaylistVersion !== content.playlistVersion)
      );
    }

    return false;
  }

  private async fetchActiveTickers(organizationId: string, deviceId: string) {
    const tickers = await this.prisma.ticker.findMany({
      where: {
        organizationId,
        status: TickerStatus.ACTIVE,
        OR: [
          { broadcastScope: TickerBroadcastScope.ALL_DEVICES },
          {
            broadcastScope: TickerBroadcastScope.SELECTED_DEVICES,
            deviceTargets: { some: { deviceId } },
          },
        ],
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });

    return tickers.map((ticker) => ({
      id: ticker.id,
      text: ticker.text,
      position: ticker.position,
      speed: ticker.speed,
      heightPercent: ticker.heightPercent,
      style: ticker.style,
      textColor: ticker.color,
      backgroundColor: ticker.backgroundColor,
      priority: ticker.priority,
    }));
  }

  private buildSyncAssetContext(query: SyncQueryDto): SyncAssetContext {
    return {
      knownAssetIds: this.parseCommaSeparatedIds(query.knownAssetIds),
      clientAssetVersions: this.parseAssetVersionMap(query.assetVersions),
      recoverCache: query.recoverCache === true,
      missingAssetIds: new Set(this.parseCommaSeparatedIds(query.missingAssetIds)),
    };
  }

  private async buildAssetManifestEntry(
    asset: ManifestAssetInput,
    durationSeconds: number,
    position: number,
    syncContext: SyncAssetContext,
  ): Promise<ManifestEntry> {
    const baseEntry = {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mimeType: asset.mimeType,
      durationSeconds,
      position,
      assetVersion: asset.contentVersion,
      updatedAt: asset.updatedAt.toISOString(),
      contentHash: asset.contentHash,
      fileSize: asset.fileSize,
    };

    const isUrlAsset = asset.type === 'URL';
    if (isUrlAsset) {
      if (!asset.url?.trim()) {
        return {
          ...baseEntry,
          status: asset.status,
          available: false,
          unavailableReason: 'URL asset is missing a destination URL',
          requiresDownload: false,
          downloadUrl: null,
          url: null,
        };
      }
      return {
        ...baseEntry,
        status: 'READY',
        available: true,
        unavailableReason: null,
        requiresDownload: false,
        downloadUrl: null,
        url: asset.url,
      };
    }

    if (asset.status !== 'READY') {
      return {
        ...baseEntry,
        status: asset.status,
        available: false,
        unavailableReason:
          asset.status === 'UPLOADING'
            ? 'Asset is still processing'
            : 'Asset is not ready for playback',
        requiresDownload: false,
        downloadUrl: null,
        url: null,
      };
    }

    if (!asset.s3Key) {
      return {
        ...baseEntry,
        status: asset.status,
        available: false,
        unavailableReason: 'Asset file is not available',
        requiresDownload: false,
        downloadUrl: null,
        url: null,
      };
    }

    const clientHasAsset = syncContext.knownAssetIds.includes(asset.id);
    const clientVersion = syncContext.clientAssetVersions.get(asset.id);
    const forceDownload =
      syncContext.recoverCache ||
      syncContext.missingAssetIds.has(asset.id) ||
      !clientHasAsset;
    const requiresDownload =
      forceDownload || clientVersion === undefined || clientVersion < asset.contentVersion;

    const downloadUrl =
      requiresDownload && asset.s3Key
        ? await this.s3.generateDownloadUrl(asset.s3Key, SYNC_DOWNLOAD_URL_TTL_SECONDS)
        : null;

    return {
      ...baseEntry,
      status: 'READY',
      available: true,
      unavailableReason: null,
      requiresDownload,
      downloadUrl,
      url: null,
    };
  }

  private async buildPlaylistManifest(
    playlist: {
      playlistAssets: {
        position: number;
        durationSeconds: number;
        asset: ManifestAssetInput;
      }[];
    },
    syncContext: SyncAssetContext,
  ): Promise<ManifestEntry[]> {
    const orderedAssets = sortPlaylistAssetsBySequence(playlist.playlistAssets);
    const manifest: ManifestEntry[] = [];

    for (const [sequence, playlistAsset] of orderedAssets.entries()) {
      manifest.push(
        await this.buildAssetManifestEntry(
          playlistAsset.asset,
          playlistAsset.durationSeconds,
          sequence,
          syncContext,
        ),
      );
    }

    return manifest;
  }

  private parseCommaSeparatedIds(value?: string): string[] {
    if (!value?.trim()) return [];
    return [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))];
  }

  private parseAssetVersionMap(value?: string): Map<string, number> {
    const versions = new Map<string, number>();
    if (!value?.trim()) return versions;

    for (const part of value.split(',')) {
      const [assetId, versionText] = part.trim().split(':');
      if (!assetId || !versionText) continue;
      const version = Number.parseInt(versionText, 10);
      if (!Number.isNaN(version)) {
        versions.set(assetId, version);
      }
    }

    return versions;
  }

  /**
   * Accept proof-of-play logs from a device.
   */
  async submitPopLogs(
    authHeader: string | undefined,
    logs: {
      assetName?: string;
      content?: string;
      playlistName?: string;
      campaignName?: string;
      status: string;
      startTime?: string;
      endTime?: string;
      durationSeconds?: number;
      timestamp?: string;
    }[],
  ) {
    const device = await this.resolveDeviceByToken(authHeader);

    if (!logs?.length) {
      return { received: 0, skipped: 0 };
    }

    const contextIndex = await new PopLogContextIndex(this.prisma).load(device.organizationId);

    const rows = logs.flatMap((log) => {
      if (!log.assetName?.trim() && !log.content?.trim()) {
        this.logger.warn(`Skipping PoP log from ${device.name}: missing assetName/content`);
        return [];
      }

      const assetName = (log.assetName ?? log.content ?? 'Unknown asset').trim();
      const rawStart = log.startTime ?? log.timestamp;
      const startTime = rawStart ? new Date(rawStart) : new Date();
      if (Number.isNaN(startTime.getTime())) {
        this.logger.warn(`Skipping PoP log from ${device.name}: invalid start time for ${assetName}`);
        return [];
      }

      const maxFutureMs = 24 * 60 * 60 * 1000;
      if (startTime.getTime() > Date.now() + maxFutureMs) {
        this.logger.warn(`Skipping PoP log from ${device.name}: start time too far in the future for ${assetName}`);
        return [];
      }

      const playbackContext = contextIndex.resolve(assetName, device.currentPlaylistId);
      const enriched = enrichPopLogFields(
        {
          assetName,
          playlistName: log.playlistName,
          campaignName: log.campaignName,
          startTime,
          endTime: log.endTime ? new Date(log.endTime) : null,
          durationSeconds: log.durationSeconds,
        },
        playbackContext,
      );

      const normalizedStatus =
        String(log.status).trim().toUpperCase() === 'VERIFIED'
          ? ProofOfPlayStatus.VERIFIED
          : ProofOfPlayStatus.FAILED;

      const baseRow = {
        organizationId: device.organizationId,
        deviceId: device.id,
        device: device.name,
        content: assetName,
        assetName,
        playlistName: enriched.playlistName,
        campaignName: enriched.campaignName,
        status: normalizedStatus,
        timestamp: startTime,
        startTime,
        endTime: enriched.endTime,
        durationSeconds: enriched.durationSeconds,
      };

      return expandPopLogPlaybackEvents(baseRow, playbackContext?.durationSeconds ?? null).map(
        (entry) => ({
          ...entry,
          timestamp: entry.startTime,
        }),
      );
    });

    if (!rows.length) {
      return { received: 0, skipped: logs.length };
    }

    await this.prisma.proofOfPlayLog.createMany({ data: rows });

    this.logger.log(
      `Received ${rows.length} PoP logs from device ${device.name}` +
        (rows.length < logs.length ? ` (${logs.length - rows.length} skipped)` : ''),
    );

    return { received: rows.length, skipped: logs.length - rows.length };
  }

  private calculateUptime(createdAt: Date): string {
    const diffMs = Date.now() - createdAt.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  }
}
