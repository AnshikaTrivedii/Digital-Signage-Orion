import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Device,
  DeviceCacheCommandType,
  DeviceStatus,
  DeviceSystemLogCategory,
  Prisma,
} from '@prisma/client';
import { DeviceCacheService } from '../device-cache/device-cache.service';
import { PrismaService } from '../prisma/prisma.service';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

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

  resolveEffectiveStatus(device: Device): DeviceStatus {
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
      orientation: device.orientation,
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
      currentContent: device.currentLayout?.name ?? device.currentPlaylist?.name ?? device.currentContent ?? 'N/A',
    };
  }

  getDeviceHealth(device: DeviceWithPlaylist) {
    const status = this.resolveEffectiveStatus(device);
    const storageUsed = Math.max(0, device.storageTotalBytes - device.storageFreeBytes);
    return {
      deviceId: device.id,
      status: status.toLowerCase(),
      cpu: device.cpu,
      ram: device.ram,
      temp: device.temp,
      storage: {
        totalBytes: device.storageTotalBytes,
        freeBytes: device.storageFreeBytes,
        usedBytes: storageUsed,
        totalLabel: this.deviceCache.formatBytes(device.storageTotalBytes),
        freeLabel: this.deviceCache.formatBytes(device.storageFreeBytes),
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
      orientation: device.orientation,
      resolution: device.resolution,
      timezone: device.timezone,
      lastReportedAt: device.lastSeenAt?.toISOString() ?? null,
    };
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

  getPlayerConfig(device: Device) {
    return {
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
    if (report.playbackUptimeSeconds !== undefined) data.playbackUptimeSeconds = report.playbackUptimeSeconds;
    if (report.playbackUptimeSeconds !== undefined) {
      data.uptime = this.formatUptimeSeconds(report.playbackUptimeSeconds);
    }
    if (report.ip !== undefined) data.ip = report.ip;
    if (report.macAddress !== undefined) data.macAddress = report.macAddress;
    if (report.resolution !== undefined) data.resolution = report.resolution;
    if (report.orientation !== undefined) data.orientation = report.orientation;
    if (report.timezone !== undefined) data.timezone = report.timezone;
    if (report.androidVersion !== undefined) {
      data.androidVersion = report.androidVersion;
      data.os = report.androidVersion;
    }
    if (report.playerVersion !== undefined) data.playerVersion = report.playerVersion;
    if (report.deviceModel !== undefined) data.deviceModel = report.deviceModel;
    if (report.manufacturer !== undefined) data.manufacturer = report.manufacturer;
    if (report.deviceName !== undefined && report.deviceName.trim()) {
      data.name = report.deviceName.trim();
    }
    if (report.lastSyncTime !== undefined) {
      const parsed = new Date(report.lastSyncTime);
      if (!Number.isNaN(parsed.getTime())) {
        data.lastSuccessfulSyncAt = parsed;
      }
    }
    if (report.storageTotalBytes !== undefined) data.storageTotalBytes = report.storageTotalBytes;
    if (report.storageFreeBytes !== undefined) data.storageFreeBytes = report.storageFreeBytes;
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
