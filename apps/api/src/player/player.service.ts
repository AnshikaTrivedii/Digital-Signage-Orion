import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Device,
  DeviceCacheCommandStatus,
  DeviceStatus,
  ProofOfPlayStatus,
  TickerBroadcastScope,
  TickerStatus,
  ZoneType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  enrichPopLogFields,
  PopLogContextIndex,
  popLogNaturalKey,
} from '../common/pop-log-enrichment';
import {
  buildManifestSequenceSignature,
  formatPlaylistOrderLog,
  isSequentialManifest,
  sortPlaylistAssetsBySequence,
} from '../common/playlist-order';
import { DeviceCacheService } from '../device-cache/device-cache.service';
import { DeviceManagementService } from '../device-management/device-management.service';
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
  documentFormat?: string | null;
};

type ManifestEntry = {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  documentFormat: string | null;
  /** null = player should use device default duration (non-video) or natural end (video). */
  durationSeconds: number | null;
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
    private readonly deviceManagement: DeviceManagementService,
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
  async initPairing(body: {
    hardwareId: string;
    androidVersion?: string;
    playerVersion?: string;
    manufacturer?: string;
    deviceModel?: string;
    deviceName?: string;
    ip?: string;
    macAddress?: string;
    resolution?: string;
    orientation?: string;
    timezone?: string;
  }) {
    const hardwareId = body.hardwareId;
    if (!hardwareId?.trim()) {
      throw new BadRequestException('hardwareId is required');
    }

    const trimmedId = hardwareId.trim();
    const registrationMetadata = this.buildRegistrationMetadata(body);

    // Check if device already exists with this hardwareId
    const existing = await this.prisma.device.findUnique({
      where: { hardwareId: trimmedId },
    });

    if (existing) {
      if (Object.keys(registrationMetadata).length > 0) {
        await this.prisma.device.update({
          where: { id: existing.id },
          data: registrationMetadata,
        });
      }

      // Still registered with a live token — player already has credentials.
      if (existing.isPaired && existing.deviceToken && existing.organizationId) {
        return {
          hardwareId: trimmedId,
          isPaired: true,
          pairingCode: null,
          pairingSecret: null,
        };
      }

      // Unregistered / unpaired / deleted-session: always mint a fresh pairing
      // code so the CMS "Add Device" flow can claim this hardware again.
      const pairingCode = await this.getUniquePairingCode();
      const pairingSecret = this.generatePairingSecret();
      await this.prisma.device.update({
        where: { id: existing.id },
        data: {
          pairingCode,
          pairingSecret,
          isPaired: false,
          deviceToken: null,
          organizationId: null,
          currentPlaylistId: null,
          currentLayoutId: null,
          ...registrationMetadata,
        },
      });

      this.logger.log(
        `Re-init pairing for hardwareId=${trimmedId} deviceId=${existing.id} code=${pairingCode}`,
      );

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
        name: body.deviceName?.trim() || `Device-${trimmedId.slice(0, 8)}`,
        pairingCode,
        pairingSecret,
        isPaired: false,
        status: DeviceStatus.OFFLINE,
        ...registrationMetadata,
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

  private buildRegistrationMetadata(body: {
    androidVersion?: string;
    playerVersion?: string;
    manufacturer?: string;
    deviceModel?: string;
    deviceName?: string;
    ip?: string;
    macAddress?: string;
    resolution?: string;
    orientation?: string;
    timezone?: string;
  }) {
    const data: Record<string, string> = {};
    if (body.androidVersion?.trim()) {
      data.androidVersion = body.androidVersion.trim();
      data.os = body.androidVersion.trim();
    }
    if (body.playerVersion?.trim()) data.playerVersion = body.playerVersion.trim();
    if (body.manufacturer?.trim()) data.manufacturer = body.manufacturer.trim();
    if (body.deviceModel?.trim()) data.deviceModel = body.deviceModel.trim();
    if (body.deviceName?.trim()) data.name = body.deviceName.trim();
    if (body.ip?.trim()) data.ip = body.ip.trim();
    if (body.macAddress?.trim()) data.macAddress = body.macAddress.trim();
    if (body.resolution?.trim()) data.resolution = body.resolution.trim();
    if (body.orientation?.trim()) data.orientation = body.orientation.trim();
    if (body.timezone?.trim()) data.timezone = body.timezone.trim();
    return data;
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
   * Soft-unregistered devices keep their token so the player receives an explicit
   * UNREGISTERED status. Missing tokens mean the device row was hard-deleted.
   */
  private async resolveDeviceByToken(authHeader: string | undefined): Promise<PairedDevice> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        message: 'Missing device token',
        deviceStatus: 'DELETED',
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const device = await this.prisma.device.findUnique({
      where: { deviceToken: token },
    });

    if (!device) {
      throw new UnauthorizedException({
        message: 'Device has been deleted',
        deviceStatus: 'DELETED',
      });
    }

    if (!device.isPaired || !device.organizationId) {
      throw new UnauthorizedException({
        message: 'Device has been unregistered',
        deviceStatus: 'UNREGISTERED',
      });
    }

    return { ...device, organizationId: device.organizationId };
  }

  private formatPlayerCommandPayload(
    pendingCommand: { id: string; command: string } | null,
  ) {
    const commands = pendingCommand
      ? [{ id: pendingCommand.id, type: pendingCommand.command, params: {} }]
      : [];
    return { pendingCommand, cacheCommand: pendingCommand, commands };
  }

  /**
   * Receive heartbeat telemetry from a device.
   */
  async heartbeat(
    authHeader: string | undefined,
    data: {
      cpu: number;
      ram: number;
      temp: number;
      currentContent?: string;
      currentAsset?: string;
      currentPlaylistName?: string;
      playbackStatus?: string;
      playbackUptimeSeconds?: number;
      ip?: string;
      macAddress?: string;
      resolution?: string;
      orientation?: string;
      timezone?: string;
      androidVersion?: string;
      playerVersion?: string;
      deviceModel?: string;
      manufacturer?: string;
      deviceName?: string;
      lastSyncTime?: string;
      storageTotalBytes?: number;
      storageFreeBytes?: number;
      networkStatus?: string;
      wifiSignalStrength?: number;
      brightness?: number;
      volume?: number;
      screenTimeoutSeconds?: number;
      permissions?: {
        internet?: boolean;
        storage?: boolean;
        foregroundService?: boolean;
        bootReceiver?: boolean;
        wakeLock?: boolean;
        notification?: boolean;
        batteryOptimizationDisabled?: boolean;
        autoStart?: boolean;
        kioskMode?: boolean;
      };
    },
  ) {
    const device = await this.resolveDeviceByToken(authHeader);
    if (process.env.PLAYER_HEARTBEAT_LOG !== 'false') {
      this.logger.log(
        `Heartbeat accepted deviceId=${device.id} playerVersion=${data.playerVersion ?? 'unknown'} storageTotal=${data.storageTotalBytes ?? 'n/a'}`,
      );
    }
    await this.deviceManagement.ingestTelemetry(device.id, data);
    const contentRevision = await this.getDeviceContentRevision(device);
    const refreshed = await this.prisma.device.findUnique({ where: { id: device.id } });
    const syncRequired = await this.computeSyncRequired(device, contentRevision);
    const pendingCommand = await this.deviceCache.deliverPendingCommand(device.id);
    const playerConfig = this.deviceManagement.getPlayerConfig(refreshed ?? device);
    const commandPayload = this.formatPlayerCommandPayload(pendingCommand);

    return {
      status: 'ok',
      deviceStatus: 'REGISTERED',
      contentRevision: contentRevision.revision,
      syncRequired,
      configVersion: playerConfig.configVersion,
      popLogsExpected: playerConfig.popLogsExpected,
      syncIntervalSeconds: playerConfig.syncIntervalSeconds,
      revisionPollIntervalSeconds: playerConfig.revisionPollIntervalSeconds,
      initialSyncPending: playerConfig.initialSyncPending,
      initialSyncTimeoutSeconds: playerConfig.initialSyncTimeoutSeconds,
      features: playerConfig.features,
      orientation: playerConfig.orientation,
      stretchToFit: playerConfig.stretchToFit,
      defaultImageDuration: playerConfig.defaultImageDuration,
      defaultVideoDuration: playerConfig.defaultVideoDuration,
      defaultDocumentDuration: playerConfig.defaultDocumentDuration,
      defaultUrlDuration: playerConfig.defaultUrlDuration,
      display: playerConfig.display,
      playback: playerConfig.playback,
      ...commandPayload,
    };
  }

  /**
   * Full device status report (telemetry + optional command completion).
   */
  async submitDeviceReport(
    authHeader: string | undefined,
    report: {
      cpu: number;
      ram: number;
      temp: number;
      currentContent?: string;
      currentAsset?: string;
      currentPlaylistName?: string;
      playbackStatus?: string;
      playbackUptimeSeconds?: number;
      ip?: string;
      macAddress?: string;
      resolution?: string;
      orientation?: string;
      timezone?: string;
      androidVersion?: string;
      playerVersion?: string;
      deviceModel?: string;
      manufacturer?: string;
      deviceName?: string;
      lastSyncTime?: string;
      storageTotalBytes?: number;
      storageFreeBytes?: number;
      networkStatus?: string;
      wifiSignalStrength?: number;
      brightness?: number;
      volume?: number;
      screenTimeoutSeconds?: number;
      screenshotUrl?: string;
      completedCommandId?: string;
      commandFailed?: boolean;
      commandError?: string;
      permissions?: {
        internet?: boolean;
        storage?: boolean;
        foregroundService?: boolean;
        bootReceiver?: boolean;
        wakeLock?: boolean;
        notification?: boolean;
        batteryOptimizationDisabled?: boolean;
        autoStart?: boolean;
        kioskMode?: boolean;
      };
    },
  ) {
    const device = await this.resolveDeviceByToken(authHeader);
    await this.deviceManagement.ingestTelemetry(device.id, report);

    if (report.completedCommandId) {
      await this.prisma.deviceCacheCommand.updateMany({
        where: {
          id: report.completedCommandId,
          deviceId: device.id,
        },
        data: {
          status: report.commandFailed
            ? DeviceCacheCommandStatus.FAILED
            : DeviceCacheCommandStatus.COMPLETED,
          completedAt: new Date(),
          errorMessage: report.commandError ?? null,
        },
      });
    }

    const refreshed = await this.prisma.device.findUnique({ where: { id: device.id } });
    const pendingCommand = await this.deviceCache.deliverPendingCommand(device.id);
    const playerConfig = this.deviceManagement.getPlayerConfig(refreshed ?? device);
    const commandPayload = this.formatPlayerCommandPayload(pendingCommand);

    return {
      received: true,
      configVersion: playerConfig.configVersion,
      popLogsExpected: playerConfig.popLogsExpected,
      syncIntervalSeconds: playerConfig.syncIntervalSeconds,
      revisionPollIntervalSeconds: playerConfig.revisionPollIntervalSeconds,
      initialSyncPending: playerConfig.initialSyncPending,
      initialSyncTimeoutSeconds: playerConfig.initialSyncTimeoutSeconds,
      features: playerConfig.features,
      orientation: playerConfig.orientation,
      stretchToFit: playerConfig.stretchToFit,
      defaultImageDuration: playerConfig.defaultImageDuration,
      defaultVideoDuration: playerConfig.defaultVideoDuration,
      defaultDocumentDuration: playerConfig.defaultDocumentDuration,
      defaultUrlDuration: playerConfig.defaultUrlDuration,
      display: playerConfig.display,
      playback: playerConfig.playback,
      ...commandPayload,
    };
  }

  async submitSystemLogs(
    authHeader: string | undefined,
    logs: { category: string; message: string; metadata?: Record<string, unknown> }[],
  ) {
    const device = await this.resolveDeviceByToken(authHeader);
    return this.deviceManagement.ingestSystemLogs(device.id, logs);
  }

  /**
   * Lightweight revision check polled by Android every ~5 seconds.
   * Changes whenever the assigned playlist or layout manifest is bumped.
   */
  async getSyncRevision(authHeader: string | undefined) {
    const device = await this.resolveDeviceByToken(authHeader);
    // Revision polls every ~5s — treat them as live presence so CMS status
    // stays Online while the player is actively talking to the API.
    await this.deviceManagement.touchPresence(device.id);
    const contentRevision = await this.getDeviceContentRevision(device);
    const syncRequired = await this.computeSyncRequired(device, contentRevision);
    const playerConfig = this.deviceManagement.getPlayerConfig(device);

    return {
      deviceStatus: 'REGISTERED',
      revision: contentRevision.revision,
      updatedAt: contentRevision.updatedAt,
      syncRequired,
      playlistVersion: contentRevision.playlistVersion,
      layoutVersion: contentRevision.layoutVersion,
      contentType: device.currentLayoutId ? 'layout' : device.currentPlaylistId ? 'playlist' : 'none',
      playlistId: device.currentPlaylistId,
      layoutId: device.currentLayoutId,
      initialSyncPending: playerConfig.initialSyncPending,
      revisionPollIntervalSeconds: playerConfig.revisionPollIntervalSeconds,
      syncIntervalSeconds: playerConfig.syncIntervalSeconds,
      configVersion: playerConfig.configVersion,
      orientation: playerConfig.orientation,
      stretchToFit: playerConfig.stretchToFit,
      defaultImageDuration: playerConfig.defaultImageDuration,
      defaultVideoDuration: playerConfig.defaultVideoDuration,
      defaultDocumentDuration: playerConfig.defaultDocumentDuration,
      defaultUrlDuration: playerConfig.defaultUrlDuration,
      display: playerConfig.display,
      playback: playerConfig.playback,
    };
  }

  /**
   * Return the active playlist manifest with incremental sync support.
   *
   * Stable polling: when the client reports the current playlistVersion and already
   * has every asset cached, returns unchanged=true with the full manifest inline
   * so the player can keep playing without applying a partial update.
   *
   * Playlist edits bump syncVersion; the next sync returns unchanged=false with a
   * complete manifest (never partial, never empty while CMS assets exist).
   */
  async syncPlaylist(authHeader: string | undefined, query: SyncQueryDto = {}) {
    const device = await this.resolveDeviceByToken(authHeader);
    await this.deviceManagement.touchPresence(device.id);
    const syncContext = this.buildSyncAssetContext(query);

    const payload = device.currentLayoutId
      ? await this.syncLayout(device, query, syncContext)
      : await this.buildPlaylistSyncResponse(device, query, syncContext);

    const pendingCommand = (await this.deviceCache.deliverPendingCommand(device.id)) ?? null;
    const refreshedDevice = await this.prisma.device.findUnique({ where: { id: device.id } });
    const effectiveDevice: PairedDevice =
      refreshedDevice?.organizationId != null
        ? { ...refreshedDevice, organizationId: refreshedDevice.organizationId }
        : device;
    const contentRevision = await this.getDeviceContentRevision(effectiveDevice);
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    const pendingDownloadCount = assets.filter(
      (entry) => (entry as { requiresDownload?: boolean }).requiresDownload,
    ).length;
    const syncRequired =
      (await this.computeSyncRequired(effectiveDevice, contentRevision)) || pendingDownloadCount > 0;

    return {
      ...payload,
      deviceStatus: 'REGISTERED',
      syncRequired,
      pendingDownloadCount,
      contentRevision: contentRevision.revision,
      cacheCommand: pendingCommand,
      pendingCommand,
      ...this.deviceManagement.getPlayerConfig(effectiveDevice),
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

    const orderedAssets = sortPlaylistAssetsBySequence(playlist.playlistAssets);
    const manifest = await this.buildPlaylistManifest({ playlistAssets: orderedAssets }, syncContext);
    this.ensureCompletePlaylistManifest(playlist.id, orderedAssets.length, manifest);

    const currentAssetIds = manifest.map((entry) => entry.id);
    const removedAssetIds = syncContext.knownAssetIds.filter((id) => !currentAssetIds.includes(id));
    const sequenceSignature = buildManifestSequenceSignature(manifest);
    const manifestComplete = manifest.length === orderedAssets.length;

    const clientReportedVersion = query.playlistVersion;
    const playlistVersionMatches =
      clientReportedVersion !== undefined && clientReportedVersion === playlist.syncVersion;
    const clientMissingAssets = currentAssetIds.some((id) => !syncContext.knownAssetIds.includes(id));
    const clientHasPendingDownloads = manifest.some((entry) => entry.requiresDownload);
    const contentUnchanged =
      playlistVersionMatches &&
      manifestComplete &&
      (orderedAssets.length === 0 || syncContext.knownAssetIds.length > 0) &&
      !clientMissingAssets &&
      !clientHasPendingDownloads &&
      !syncContext.recoverCache &&
      syncContext.missingAssetIds.size === 0;

    const shouldAckPlaylistVersion = contentUnchanged;

    const assignedDeviceCount = await this.prisma.device.count({
      where: { currentPlaylistId: playlist.id },
    });

    this.logger.log(
      `Playlist sync playlistId=${playlist.id} deviceId=${device.id} ` +
        `syncType=${contentUnchanged ? 'stable' : 'update'} ` +
        `playlistVersion=${playlist.syncVersion} assetCount=${manifest.length} ` +
        `sequence=${sequenceSignature} ` +
        `previousVersion=${clientReportedVersion ?? 'none'} newVersion=${playlist.syncVersion} ` +
        `updatedAt=${playlist.updatedAt.toISOString()} ` +
        `deviceCount=${assignedDeviceCount} unchanged=${contentUnchanged} ` +
        `manifestComplete=${manifestComplete} ` +
        `returnedOrder=${formatPlaylistOrderLog(manifest)}`,
    );

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSync: new Date().toISOString(),
        ...(shouldAckPlaylistVersion
          ? {
              lastAckedPlaylistVersion: playlist.syncVersion,
              ...(device.pendingInitialSync
                ? { pendingInitialSync: false, initialSyncRequestedAt: null }
                : {}),
            }
          : {}),
      },
    });

    return {
      unchanged: contentUnchanged,
      playlistVersion: playlist.syncVersion,
      updatedAt: playlist.updatedAt.toISOString(),
      assetCount: manifest.length,
      manifestComplete,
      sequenceSignature,
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
          this.resolveManifestDurationSeconds(zone.asset.defaultDurationSeconds ?? null),
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

    const shouldAckLayoutVersion = contentUnchanged;

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
        ...(shouldAckLayoutVersion && device.pendingInitialSync
          ? { pendingInitialSync: false, initialSyncRequestedAt: null }
          : {}),
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

  private async getTickerRevisionSuffix(organizationId: string, deviceId: string): Promise<string> {
    const aggregate = await this.prisma.ticker.aggregate({
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
      _max: { updatedAt: true },
      _count: { _all: true },
    });

    if (!aggregate._count._all) return ':tk0';
    return `:tk${aggregate._max.updatedAt?.getTime() ?? 0}c${aggregate._count._all}`;
  }

  private async getDeviceContentRevision(device: PairedDevice): Promise<ContentRevisionState> {
    const tickerSuffix = await this.getTickerRevisionSuffix(device.organizationId, device.id);

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
        revision: `ly:${layout.id}:v${layout.syncVersion}:${layout.updatedAt.getTime()}${tickerSuffix}`,
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
        revision: `pl:${playlist.id}:v${playlist.syncVersion}:${playlist.updatedAt.getTime()}${tickerSuffix}`,
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

  private async computeSyncRequired(
    device: PairedDevice,
    content: ContentRevisionState,
  ): Promise<boolean> {
    if (content.revision === 'none') return false;

    if (device.currentLayoutId) {
      const layoutSyncRequired =
        content.layoutVersion != null &&
        (device.lastAckedLayoutVersion == null ||
          device.lastAckedLayoutVersion !== content.layoutVersion);
      if (layoutSyncRequired) return true;
    } else if (device.currentPlaylistId) {
      const playlistSyncRequired =
        content.playlistVersion != null &&
        (device.lastAckedPlaylistVersion == null ||
          device.lastAckedPlaylistVersion !== content.playlistVersion);
      if (playlistSyncRequired) return true;
    } else {
      return false;
    }

    const tickerAggregate = await this.prisma.ticker.aggregate({
      where: {
        organizationId: device.organizationId,
        status: TickerStatus.ACTIVE,
        OR: [
          { broadcastScope: TickerBroadcastScope.ALL_DEVICES },
          {
            broadcastScope: TickerBroadcastScope.SELECTED_DEVICES,
            deviceTargets: { some: { deviceId: device.id } },
          },
        ],
      },
      _max: { updatedAt: true },
      _count: { _all: true },
    });

    if (!tickerAggregate._count._all) return false;

    const lastSyncAt = device.lastSync ? new Date(device.lastSync) : null;
    const tickerUpdatedAt = tickerAggregate._max.updatedAt;
    if (!tickerUpdatedAt) return false;
    if (!lastSyncAt || tickerUpdatedAt > lastSyncAt) return true;

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
    durationSeconds: number | null,
    position: number,
    syncContext: SyncAssetContext,
  ): Promise<ManifestEntry> {
    const baseEntry = {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mimeType: asset.mimeType,
      documentFormat: asset.documentFormat ?? null,
      durationSeconds,
      position,
      assetVersion: asset.contentVersion,
      updatedAt: asset.updatedAt.toISOString(),
      contentHash: asset.contentHash,
      fileSize: asset.fileSize,
    };

    // HTML playlist assets are retired — keep DB rows intact but do not serve for playback.
    if (asset.type === 'HTML') {
      return {
        ...baseEntry,
        status: asset.status,
        available: false,
        unavailableReason: 'HTML assets are no longer supported',
        requiresDownload: false,
        downloadUrl: null,
        url: null,
      };
    }

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
        durationSeconds: number | null;
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
          this.resolveManifestDurationSeconds(playlistAsset.durationSeconds),
          sequence,
          syncContext,
        ),
      );
    }

    return manifest;
  }

  /**
   * null playlist duration = no override → player uses device default (or native video length).
   * Positive integer = explicit playlist override.
   */
  private resolveManifestDurationSeconds(
    playlistDurationSeconds: number | null,
  ): number | null {
    if (playlistDurationSeconds == null) {
      return null;
    }
    const raw = Math.floor(Number(playlistDurationSeconds));
    if (!Number.isFinite(raw) || raw <= 0) {
      return null;
    }
    return raw;
  }

  /**
   * Reject partial manifests — the player must never receive an incomplete playlist during updates.
   */
  private ensureCompletePlaylistManifest(
    playlistId: string,
    expectedAssetCount: number,
    manifest: ManifestEntry[],
  ): void {
    if (expectedAssetCount === 0) {
      return;
    }

    if (manifest.length !== expectedAssetCount) {
      this.logger.error(
        `Incomplete playlist manifest playlistId=${playlistId} expected=${expectedAssetCount} actual=${manifest.length}`,
      );
      throw new InternalServerErrorException('Playlist manifest incomplete');
    }

    if (!isSequentialManifest(manifest)) {
      this.logger.error(
        `Invalid playlist sequence playlistId=${playlistId} positions=${manifest.map((entry) => entry.position).join(',')}`,
      );
      throw new InternalServerErrorException('Playlist manifest sequence invalid');
    }
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
    const batchSize = logs?.length ?? 0;

    if (process.env.PLAYER_POP_LOG !== 'false') {
      this.logger.log(
        `PoP submit deviceId=${device.id} name=${device.name} batch=${batchSize} featureEnabled=${device.featureProofOfPlay}`,
      );
    }

    if (!device.featureProofOfPlay) {
      this.logger.warn(
        `PoP logs ignored for deviceId=${device.id} (${device.name}): featureProofOfPlay is disabled`,
      );
      return this.buildPopLogSubmitResponse(device, {
        received: 0,
        skipped: batchSize,
        accepted: false,
        reason: 'proof_of_play_disabled',
      });
    }

    if (!batchSize) {
      return this.buildPopLogSubmitResponse(device, { received: 0, skipped: 0, accepted: true });
    }

    const contextIndex = await new PopLogContextIndex(this.prisma).load(device.organizationId);

    // A playback timestamp ahead of "now" means the device clock is wrong. Such a
    // row is still stored (never drop real playback), but no date filter can ever
    // reach past the end of today, so it must be reported back loudly.
    const clockSkewToleranceMs = 5 * 60 * 1000;
    let clockSkewed = 0;
    let maxSkewMs = 0;

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
      const skewMs = startTime.getTime() - Date.now();
      if (skewMs > maxFutureMs) {
        this.logger.warn(`Skipping PoP log from ${device.name}: start time too far in the future for ${assetName}`);
        return [];
      }
      if (skewMs > clockSkewToleranceMs) {
        clockSkewed += 1;
        maxSkewMs = Math.max(maxSkewMs, skewMs);
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

      return [baseRow];
    });

    if (!rows.length) {
      return this.buildPopLogSubmitResponse(device, {
        received: 0,
        skipped: batchSize,
        accepted: false,
        reason: 'all_logs_invalid',
      });
    }

    // Collapse repeats of the same playback event inside this batch, then let the
    // `ProofOfPlayLog_natural_key` unique index reject anything already stored, so
    // a device that re-flushes after a timeout cannot duplicate its history.
    const batchSeen = new Set<string>();
    const uniqueRows = rows.filter((row) => {
      const key = popLogNaturalKey(row);
      if (batchSeen.has(key)) return false;
      batchSeen.add(key);
      return true;
    });

    const { count: stored } = await this.prisma.proofOfPlayLog.createMany({
      data: uniqueRows,
      skipDuplicates: true,
    });

    const invalid = batchSize - rows.length;
    const duplicates = rows.length - stored;

    this.logger.log(
      `Stored ${stored} PoP logs from deviceId=${device.id} (${device.name})` +
        (invalid ? ` (${invalid} invalid)` : '') +
        (duplicates ? ` (${duplicates} already recorded)` : ''),
    );

    if (clockSkewed > 0) {
      this.logger.warn(
        `Device clock ahead of server for deviceId=${device.id} (${device.name}): ` +
          `${clockSkewed} log(s) up to ${Math.round(maxSkewMs / 60000)} min in the future. ` +
          `These will not appear under Today/Last 7 days until the device clock is corrected.`,
      );
    }

    return this.buildPopLogSubmitResponse(device, {
      received: stored,
      skipped: batchSize - stored,
      duplicates,
      clockSkewed,
      accepted: true,
    });
  }

  private buildPopLogSubmitResponse(
    device: PairedDevice,
    result: {
      received: number;
      skipped: number;
      duplicates?: number;
      clockSkewed?: number;
      accepted: boolean;
      reason?: string;
    },
  ) {
    return {
      received: result.received,
      skipped: result.skipped,
      duplicates: result.duplicates ?? 0,
      clockSkewed: result.clockSkewed ?? 0,
      accepted: result.accepted,
      deviceId: device.id,
      deviceName: device.name,
      popLogsExpected: device.featureProofOfPlay,
      ...(result.reason ? { reason: result.reason } : {}),
    };
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
