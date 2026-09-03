import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Device,
  DeviceCacheCommandType,
  DeviceStatus,
  DeviceSystemLogCategory,
  Prisma,
} from '@prisma/client';
import {
  clampPrismaInt,
  normalizeStorageBytes,
  storageBytesToNumber,
} from '../common/device-storage.utils';
import { DeviceCacheService } from '../device-cache/device-cache.service';
import { PrismaService } from '../prisma/prisma.service';

/** Presence lease. Player writes lastSeenAt on heartbeat (~60s); 3x that window. */
const OFFLINE_THRESHOLD_MS = 180 * 1000;

type DevicePresence = {
  lastSeenAt?: Date | null;
  status: DeviceStatus;
};

/** Window a freshly onboarded device has to complete its first playlist download. */
export const INITIAL_SYNC_TIMEOUT_SECONDS = 120;

/**
 * Lightweight revision poll interval advertised to the player.
 * `0` means do not poll `/player/sync-revision` — heartbeat delivers FORCE_SYNC.
 */
export const DEFAULT_REVISION_POLL_INTERVAL_SECONDS = 0;

export type InitialSyncState = 'none' | 'pending' | 'timed_out';

/** Resolve onboarding sync state for a device (pending, timed out after 120s, or none). */
export function resolveInitialSyncState(device: {
  pendingInitialSync?: boolean;
  initialSyncRequestedAt?: Date | null;
}): InitialSyncState {
  if (!device.pendingInitialSync) return 'none';
  if (!device.initialSyncRequestedAt) return 'pending';
  const elapsedMs = Date.now() - device.initialSyncRequestedAt.getTime();
  return elapsedMs > INITIAL_SYNC_TIMEOUT_SECONDS * 1000 ? 'timed_out' : 'pending';
}

type DeviceWithPlaylist = Device & {
  currentPlaylist?: { name: string } | null;
  currentLayout?: { name: string } | null;
};

@Injectable()
export class DeviceManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceCache: DeviceCacheService,
  ) {}

  async findDevice(deviceId: string, organizationId: string): Promise<DeviceWithPlaylist> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId, isPaired: true },
      include: {
        currentPlaylist: { select: { name: true } },
        currentLayout: { select: { name: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  resolveEffectiveStatus(device: DevicePresence): DeviceStatus {
    if (device.lastSeenAt) {
      const stale = Date.now() - device.lastSeenAt.getTime() > OFFLINE_THRESHOLD_MS;
      if (stale) return DeviceStatus.OFFLINE;
    } else if (device.status === DeviceStatus.ONLINE || device.status === DeviceStatus.WARNING) {
      return DeviceStatus.OFFLINE;
    }
    return device.status;
  }

  getDeviceStatus(device: DeviceWithPlaylist) {
    const status = this.resolveEffectiveStatus(device);
    const assignedPlaylist =
      device.currentPlaylist?.name ?? device.currentLayout?.name ?? null;
    return {
      deviceId: device.id,
      deviceName: device.name,
      hardwareId: device.hardwareId,
      status: status.toLowerCase(),
      online: status !== DeviceStatus.OFFLINE,
      location: device.location,
      ip: device.ip,
      macAddress: device.macAddress,
      resolution: device.resolution,
      orientation: this.normalizeOrientation(device.orientation),
      stretchToFit: device.stretchToFit,
      defaultImageDuration: device.defaultImageDuration ?? 10,
      defaultVideoDuration: device.defaultVideoDuration ?? 10,
      defaultDocumentDuration: device.defaultDocumentDuration ?? 20,
      defaultUrlDuration: device.defaultUrlDuration ?? 20,
      timezone: device.timezone,
      androidVersion: device.androidVersion || device.os,
      playerVersion: device.playerVersion,
      deviceModel: device.deviceModel,
      manufacturer: device.manufacturer,
      lastSeen: device.lastSeenAt?.toISOString() ?? null,
      lastSync: device.lastSync,
      lastSyncTime: device.lastSuccessfulSyncAt?.toISOString()
        ?? device.cacheLastReportedAt?.toISOString()
        ?? this.parseLastSyncFallback(device.lastSync),
      uptime: device.uptime,
      assignedPlaylist,
      currentContent: assignedPlaylist ?? device.currentContent ?? 'N/A',
    };
  }

  getDeviceHealth(device: DeviceWithPlaylist) {
    const status = this.resolveEffectiveStatus(device);
    const totalBytes = storageBytesToNumber(device.storageTotalBytes);
    const freeBytes = storageBytesToNumber(device.storageFreeBytes);
    const storageUsed = Math.max(0, totalBytes - freeBytes);
    return {
      deviceId: device.id,
      status: status.toLowerCase(),
      cpu: device.cpu,
      ram: device.ram,
      temp: device.temp,
      storage: {
        totalBytes,
        freeBytes,
        usedBytes: storageUsed,
        totalLabel: this.deviceCache.formatBytes(totalBytes),
        freeLabel: this.deviceCache.formatBytes(freeBytes),
        usedLabel: this.deviceCache.formatBytes(storageUsed),
      },
      cacheSizeBytes: device.cacheUsedBytes,
      cacheSizeLabel: this.deviceCache.formatBytes(device.cacheUsedBytes),
      networkStatus: device.networkStatus,
      wifiSignalStrength: device.wifiSignalStrength,
      currentPlaylist: device.currentPlaylistName ?? device.currentPlaylist?.name ?? device.cachePlaylistName ?? '—',
      currentAsset: device.currentAsset ?? device.currentContent ?? '—',
      playbackStatus: device.playbackStatus,
      playbackUptimeSeconds: device.playbackUptimeSeconds,
      playbackUptime: this.formatUptimeSeconds(device.playbackUptimeSeconds),
      lastUpdated: device.lastSeenAt?.toISOString() ?? null,
    };
  }

  getDevicePermissions(device: Device) {
    return {
      deviceId: device.id,
      permissions: {
        internet: device.permInternet,
        storage: device.permStorage,
        foregroundService: device.permForegroundService,
        bootReceiver: device.permBootReceiver,
        wakeLock: device.permWakeLock,
        notification: device.permNotification,
        batteryOptimizationDisabled: device.permBatteryOptDisabled,
        autoStart: device.permAutoStart,
        kioskMode: device.permKioskMode,
      },
      allGranted: [
        device.permInternet,
        device.permStorage,
        device.permForegroundService,
        device.permBootReceiver,
        device.permWakeLock,
        device.permNotification,
        device.permBatteryOptDisabled,
        device.permAutoStart,
        device.permKioskMode,
      ].every(Boolean),
      lastReportedAt: device.lastSeenAt?.toISOString() ?? null,
    };
  }

  getDeviceSettings(device: Device) {
    return {
      deviceId: device.id,
      brightness: device.brightness,
      volume: device.volume,
      screenTimeoutSeconds: device.screenTimeoutSeconds,
      orientation: this.normalizeOrientation(device.orientation),
      stretchToFit: device.stretchToFit,
      defaultImageDuration: device.defaultImageDuration ?? 10,
      defaultVideoDuration: device.defaultVideoDuration ?? 10,
      defaultDocumentDuration: device.defaultDocumentDuration ?? 20,
      defaultUrlDuration: device.defaultUrlDuration ?? 20,
      resolution: device.resolution,
      timezone: device.timezone,
      lastReportedAt: device.lastSeenAt?.toISOString() ?? null,
    };
  }

  getDevicePlaybackSettings(device: Device) {
    return {
      deviceId: device.id,
      imageDuration: device.defaultImageDuration,
      videoDuration: device.defaultVideoDuration,
      documentDuration: device.defaultDocumentDuration,
      urlDuration: device.defaultUrlDuration,
      lastUpdated: device.playbackSettingsUpdatedAt?.toISOString() ?? device.updatedAt.toISOString(),
    };
  }

  /**
   * Device defaults only. Playlist slot durations live on PlaylistAsset and are
   * never written here, so an explicit playlist override always survives.
   */
  async updateDevicePlaybackSettings(
    deviceId: string,
    organizationId: string,
    body: {
      imageDuration?: number;
      videoDuration?: number;
      documentDuration?: number;
      urlDuration?: number;
    },
  ) {
    await this.findDevice(deviceId, organizationId);

    const data: Prisma.DeviceUpdateInput = {
      configVersion: { increment: 1 },
      playbackSettingsUpdatedAt: new Date(),
    };
    if (typeof body.imageDuration === 'number') {
      data.defaultImageDuration = this.clampPlaybackDuration(body.imageDuration);
    }
    if (typeof body.videoDuration === 'number') {
      data.defaultVideoDuration = this.clampPlaybackDuration(body.videoDuration);
    }
    if (typeof body.documentDuration === 'number') {
      data.defaultDocumentDuration = this.clampPlaybackDuration(body.documentDuration);
    }
    if (typeof body.urlDuration === 'number') {
      data.defaultUrlDuration = this.clampPlaybackDuration(body.urlDuration);
    }

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data,
    });

    return this.getDevicePlaybackSettings(updated);
  }

  async updateDeviceDisplaySettings(
    deviceId: string,
    organizationId: string,
    body: {
      orientation?: string;
      stretchToFit?: boolean;
      defaultImageDuration?: number;
      defaultVideoDuration?: number;
      defaultDocumentDuration?: number;
      defaultUrlDuration?: number;
    },
  ) {
    await this.findDevice(deviceId, organizationId);

    const data: Prisma.DeviceUpdateInput = { configVersion: { increment: 1 } };
    if (typeof body.orientation === 'string') {
      data.orientation = this.normalizeOrientation(body.orientation);
    }
    if (typeof body.stretchToFit === 'boolean') {
      data.stretchToFit = body.stretchToFit;
    }
    if (typeof body.defaultImageDuration === 'number') {
      data.defaultImageDuration = this.clampPlaybackDuration(body.defaultImageDuration);
    }
    if (typeof body.defaultVideoDuration === 'number') {
      data.defaultVideoDuration = this.clampPlaybackDuration(body.defaultVideoDuration);
    }
    if (typeof body.defaultDocumentDuration === 'number') {
      data.defaultDocumentDuration = this.clampPlaybackDuration(body.defaultDocumentDuration);
    }
    if (typeof body.defaultUrlDuration === 'number') {
      data.defaultUrlDuration = this.clampPlaybackDuration(body.defaultUrlDuration);
    }

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data,
      include: {
        currentPlaylist: { select: { name: true } },
        currentLayout: { select: { name: true } },
      },
    });

    return updated;
  }

  getDeviceFeatures(device: Device) {
    return {
      deviceId: device.id,
      configVersion: device.configVersion,
      features: {
        autoSync: device.featureAutoSync,
        offlinePlayback: device.featureOfflinePlayback,
        proofOfPlay: device.featureProofOfPlay,
        ticker: device.featureTicker,
        watchdog: device.featureWatchdog,
        crashRecovery: device.featureCrashRecovery,
        backgroundSync: device.featureBackgroundSync,
        autoDownload: device.featureAutoDownload,
        remoteLogs: device.featureRemoteLogs,
      },
    };
  }

  async updateDeviceFeatures(
    deviceId: string,
    organizationId: string,
    body: {
      autoSync?: boolean;
      offlinePlayback?: boolean;
      proofOfPlay?: boolean;
      ticker?: boolean;
      watchdog?: boolean;
      crashRecovery?: boolean;
      backgroundSync?: boolean;
      autoDownload?: boolean;
      remoteLogs?: boolean;
    },
  ) {
    await this.findDevice(deviceId, organizationId);

    const data: Prisma.DeviceUpdateInput = { configVersion: { increment: 1 } };
    if (typeof body.autoSync === 'boolean') data.featureAutoSync = body.autoSync;
    if (typeof body.offlinePlayback === 'boolean') data.featureOfflinePlayback = body.offlinePlayback;
    if (typeof body.proofOfPlay === 'boolean') data.featureProofOfPlay = body.proofOfPlay;
    if (typeof body.ticker === 'boolean') data.featureTicker = body.ticker;
    if (typeof body.watchdog === 'boolean') data.featureWatchdog = body.watchdog;
    if (typeof body.crashRecovery === 'boolean') data.featureCrashRecovery = body.crashRecovery;
    if (typeof body.backgroundSync === 'boolean') data.featureBackgroundSync = body.backgroundSync;
    if (typeof body.autoDownload === 'boolean') data.featureAutoDownload = body.autoDownload;
    if (typeof body.remoteLogs === 'boolean') data.featureRemoteLogs = body.remoteLogs;

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data,
    });

    return this.getDeviceFeatures(updated);
  }

  async getDeviceLogs(
    deviceId: string,
    organizationId: string,
    category?: DeviceSystemLogCategory,
    limit = 100,
  ) {
    await this.findDevice(deviceId, organizationId);

    const logs = await this.prisma.deviceSystemLog.findMany({
      where: {
        deviceId,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit ?? 100), 500),
    });

    return {
      deviceId,
      total: logs.length,
      logs: logs.map((log) => ({
        id: log.id,
        category: log.category.toLowerCase(),
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async queueRemoteAction(
    deviceId: string,
    organizationId: string,
    action: string,
    requestedById?: string,
  ) {
    const command = this.parseRemoteAction(action);
    return this.deviceCache.queueCommand(deviceId, organizationId, command, requestedById);
  }

  parseRemoteAction(action: string): DeviceCacheCommandType {
    const normalized = action.trim().toUpperCase().replace(/-/g, '_');
    const map: Record<string, DeviceCacheCommandType> = {
      RESTART_PLAYER: DeviceCacheCommandType.RESTART_PLAYER,
      RESTART_DEVICE: DeviceCacheCommandType.RESTART_DEVICE,
      REBOOT: DeviceCacheCommandType.RESTART_DEVICE,
      FORCE_SYNC: DeviceCacheCommandType.FORCE_SYNC,
      CLEAR_CACHE: DeviceCacheCommandType.CLEAR_CACHE,
      REDOWNLOAD_PLAYLIST: DeviceCacheCommandType.REDOWNLOAD_PLAYLIST,
      UPLOAD_LOGS: DeviceCacheCommandType.UPLOAD_LOGS,
      TAKE_SCREENSHOT: DeviceCacheCommandType.TAKE_SCREENSHOT,
      SCREENSHOT: DeviceCacheCommandType.TAKE_SCREENSHOT,
      REFRESH_STATUS: DeviceCacheCommandType.REFRESH_STATUS,
    };
    const command = map[normalized];
    if (!command) {
      throw new BadRequestException(
        `Unknown action "${action}". Supported: restart-player, restart-device, force-sync, clear-cache, redownload-playlist, upload-logs, screenshot, refresh-status`,
      );
    }
    return command;
  }

  /**
   * Fallback full-manifest poll interval (seconds). Heartbeat delivers FORCE_SYNC
   * when CMS content changes; this timer is only a safety net.
   * Server-configurable via PLAYER_SYNC_INTERVAL_SECONDS, defaults to 600s (10 min).
   * Clamped to 30s–3600s.
   */
  getSyncIntervalSeconds(): number {
    const DEFAULT_SYNC_INTERVAL_SECONDS = 600;
    const MIN_SYNC_INTERVAL_SECONDS = 30;
    const MAX_SYNC_INTERVAL_SECONDS = 3600;
    const raw = process.env.PLAYER_SYNC_INTERVAL_SECONDS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_SYNC_INTERVAL_SECONDS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SYNC_INTERVAL_SECONDS;
    return Math.min(MAX_SYNC_INTERVAL_SECONDS, Math.max(MIN_SYNC_INTERVAL_SECONDS, Math.floor(parsed)));
  }

  /**
   * How often the player should poll GET /player/sync-revision.
   * `0` (default) disables the poll — content changes arrive on heartbeat FORCE_SYNC.
   * Server-configurable via PLAYER_REVISION_POLL_INTERVAL_SECONDS. Clamped to 0–3600s.
   */
  getRevisionPollIntervalSeconds(): number {
    const MAX_REVISION_POLL_INTERVAL_SECONDS = 3600;
    const raw = process.env.PLAYER_REVISION_POLL_INTERVAL_SECONDS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_REVISION_POLL_INTERVAL_SECONDS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REVISION_POLL_INTERVAL_SECONDS;
    return Math.min(MAX_REVISION_POLL_INTERVAL_SECONDS, Math.floor(parsed));
  }

  getPlayerConfig(device: Device) {
    const orientation = this.normalizeOrientation(device.orientation);
    const stretchToFit = Boolean(device.stretchToFit);
    const defaultImageDuration = this.clampPlaybackDuration(device.defaultImageDuration ?? 10);
    const defaultVideoDuration = this.clampPlaybackDuration(device.defaultVideoDuration ?? 10);
    const defaultDocumentDuration = this.clampPlaybackDuration(device.defaultDocumentDuration ?? 20);
    const defaultUrlDuration = this.clampPlaybackDuration(device.defaultUrlDuration ?? 20);
    // Fallbacks only — the player applies these when a manifest entry has durationSeconds: null.
    const playback = {
      imageDuration: defaultImageDuration,
      videoDuration: defaultVideoDuration,
      documentDuration: defaultDocumentDuration,
      urlDuration: defaultUrlDuration,
    };
    return {
      configVersion: device.configVersion,
      popLogsExpected: device.featureProofOfPlay,
      syncIntervalSeconds: this.getSyncIntervalSeconds(),
      revisionPollIntervalSeconds: this.getRevisionPollIntervalSeconds(),
      initialSyncPending: resolveInitialSyncState(device) === 'pending',
      initialSyncTimeoutSeconds: INITIAL_SYNC_TIMEOUT_SECONDS,
      // Top-level fields for the Android player (and nested display for CMS UI).
      orientation,
      stretchToFit,
      defaultImageDuration,
      defaultVideoDuration,
      defaultDocumentDuration,
      defaultUrlDuration,
      features: {
        autoSync: device.featureAutoSync,
        offlinePlayback: device.featureOfflinePlayback,
        proofOfPlay: device.featureProofOfPlay,
        ticker: device.featureTicker,
        watchdog: device.featureWatchdog,
        crashRecovery: device.featureCrashRecovery,
        backgroundSync: device.featureBackgroundSync,
        autoDownload: device.featureAutoDownload,
        remoteLogs: device.featureRemoteLogs,
      },
      display: {
        orientation,
        stretchToFit,
        playback,
      },
      playback,
    };
  }

  normalizeOrientation(value?: string | null): 'LANDSCAPE' | 'PORTRAIT' {
    const normalized = (value ?? 'LANDSCAPE').trim().toUpperCase();
    return normalized === 'PORTRAIT' ? 'PORTRAIT' : 'LANDSCAPE';
  }

  clampPlaybackDuration(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(600, Math.max(1, Math.floor(value)));
  }

  /**
   * Mark a device as recently seen from any authenticated player API call.
   * Online/offline in the CMS is derived from `lastSeenAt` (3-minute threshold).
   * Heartbeat is the primary presence source; sync still refreshes it so a
   * device that is downloading content stays Online.
   */
  async touchPresence(deviceId: string) {
    const now = new Date();
    const existing = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { lastSeenAt: true, status: true },
    });
    // Skip frequent presence writes when already online (legacy revision polls).
    if (
      existing?.lastSeenAt
      && now.getTime() - existing.lastSeenAt.getTime() < 30_000
      && existing.status !== DeviceStatus.OFFLINE
    ) {
      return;
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSeenAt: now,
        status: existing?.status === DeviceStatus.WARNING ? DeviceStatus.WARNING : DeviceStatus.ONLINE,
      },
    });
  }

  async ingestTelemetry(deviceId: string, report: DeviceTelemetryReport) {
    const now = new Date();
    const data: Prisma.DeviceUpdateInput = {
      lastSeenAt: now,
      status:
        (report.cpu ?? 0) > 85 || (report.temp ?? 0) > 80
          ? DeviceStatus.WARNING
          : DeviceStatus.ONLINE,
    };

    if (report.cpu !== undefined) data.cpu = report.cpu;
    if (report.ram !== undefined) data.ram = report.ram;
    if (report.temp !== undefined) data.temp = report.temp;
    if (report.currentContent !== undefined) data.currentContent = report.currentContent;
    if (report.currentAsset !== undefined) data.currentAsset = report.currentAsset;
    if (report.currentPlaylistName !== undefined) data.currentPlaylistName = report.currentPlaylistName;
    if (report.playbackStatus !== undefined) data.playbackStatus = report.playbackStatus;
    if (report.playbackUptimeSeconds !== undefined) {
      data.playbackUptimeSeconds = clampPrismaInt(report.playbackUptimeSeconds);
      data.uptime = this.formatUptimeSeconds(data.playbackUptimeSeconds as number);
    }
    if (report.ip !== undefined) data.ip = report.ip;
    if (report.macAddress !== undefined) data.macAddress = report.macAddress;
    if (report.resolution !== undefined) data.resolution = report.resolution;
    // Orientation is CMS-managed (Device Details → Screen Orientation) and pushed
    // to the player via `display.orientation`. Do not overwrite from telemetry.
    if (report.timezone !== undefined) data.timezone = report.timezone;
    if (report.androidVersion !== undefined) {
      data.androidVersion = report.androidVersion;
      data.os = report.androidVersion;
    }
    if (report.playerVersion !== undefined) data.playerVersion = report.playerVersion;
    if (report.deviceModel !== undefined) data.deviceModel = report.deviceModel;
    if (report.manufacturer !== undefined) data.manufacturer = report.manufacturer;
    // Display name is CMS-managed (Devices → Edit). Do not overwrite from
    // heartbeat / device-report telemetry — that is the Android Settings name.
    if (report.lastSyncTime !== undefined) {
      const parsed = new Date(report.lastSyncTime);
      if (!Number.isNaN(parsed.getTime())) {
        data.lastSuccessfulSyncAt = parsed;
      }
    }
    if (report.storageTotalBytes !== undefined) {
      data.storageTotalBytes = normalizeStorageBytes(report.storageTotalBytes);
    }
    if (report.storageFreeBytes !== undefined) {
      data.storageFreeBytes = normalizeStorageBytes(report.storageFreeBytes);
    }
    if (report.networkStatus !== undefined) data.networkStatus = report.networkStatus;
    if (report.wifiSignalStrength !== undefined) data.wifiSignalStrength = report.wifiSignalStrength;
    if (report.brightness !== undefined) data.brightness = report.brightness;
    if (report.volume !== undefined) data.volume = report.volume;
    if (report.screenTimeoutSeconds !== undefined) data.screenTimeoutSeconds = report.screenTimeoutSeconds;

    if (report.permissions) {
      const p = report.permissions;
      if (p.internet !== undefined) data.permInternet = p.internet;
      if (p.storage !== undefined) data.permStorage = p.storage;
      if (p.foregroundService !== undefined) data.permForegroundService = p.foregroundService;
      if (p.bootReceiver !== undefined) data.permBootReceiver = p.bootReceiver;
      if (p.wakeLock !== undefined) data.permWakeLock = p.wakeLock;
      if (p.notification !== undefined) data.permNotification = p.notification;
      if (p.batteryOptimizationDisabled !== undefined) data.permBatteryOptDisabled = p.batteryOptimizationDisabled;
      if (p.autoStart !== undefined) data.permAutoStart = p.autoStart;
      if (p.kioskMode !== undefined) data.permKioskMode = p.kioskMode;
    }

    if (report.screenshotUrl) {
      data.lastScreenshotUrl = report.screenshotUrl;
      data.lastScreenshotAt = now;
    }

    data.lastSync = now.toISOString();

    await this.prisma.device.update({ where: { id: deviceId }, data });
  }

  async ingestSystemLogs(
    deviceId: string,
    logs: { category: string; message: string; metadata?: Record<string, unknown> }[],
  ) {
    if (!logs?.length) return { received: 0 };

    const rows = logs
      .filter((log) => log.message?.trim())
      .map((log) => ({
        deviceId,
        category: this.parseLogCategory(log.category),
        message: log.message.trim(),
        metadata: log.metadata as Prisma.InputJsonValue | undefined,
      }));

    if (!rows.length) return { received: 0 };

    await this.prisma.deviceSystemLog.createMany({ data: rows });
    return { received: rows.length };
  }

  async recordSystemLog(deviceId: string, category: DeviceSystemLogCategory, message: string) {
    await this.prisma.deviceSystemLog.create({
      data: { deviceId, category, message },
    });
  }

  private parseLogCategory(value: string): DeviceSystemLogCategory {
    const normalized = (value ?? 'ERROR').trim().toUpperCase();
    if (normalized in DeviceSystemLogCategory) {
      return normalized as DeviceSystemLogCategory;
    }
    return DeviceSystemLogCategory.ERROR;
  }

  private formatUptimeSeconds(seconds: number): string {
    if (seconds <= 0) return '0s';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  private parseLastSyncFallback(lastSync: string | null | undefined): string | null {
    if (!lastSync || lastSync === 'Awaiting first sync') return null;
    const parsed = new Date(lastSync);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
}

export type DeviceTelemetryReport = {
  cpu?: number;
  ram?: number;
  temp?: number;
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
};
