import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Device, DeviceStatus, ProofOfPlayStatus, TickerBroadcastScope, TickerStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { enrichPopLogFields, PopLogContextIndex } from '../common/pop-log-enrichment';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import type { SyncQueryDto } from './dto/sync-query.dto';

/** Device resolved from a valid paired token — organizationId is guaranteed. */
type PairedDevice = Device & { organizationId: string };

/** Presigned URL lifetime for player sync downloads (7 days). */
const SYNC_DOWNLOAD_URL_TTL_SECONDS = 86400 * 7;

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
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

    if (data.currentContent?.trim()) {
      await this.recordHeartbeatPopSample(device.id, device.organizationId, device.name, data.currentContent.trim());
    }

    return { status: 'ok' };
  }

  /**
   * Fallback PoP when the player has not flushed pop-logs yet.
   * Creates at most one sample per asset every 5 minutes per device.
   */
  private async recordHeartbeatPopSample(
    deviceId: string,
    organizationId: string,
    deviceName: string,
    assetName: string,
  ) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recent = await this.prisma.proofOfPlayLog.findFirst({
      where: {
        deviceId,
        assetName,
        startTime: { gte: fiveMinutesAgo },
      },
      select: { id: true },
    });
    if (recent) return;

    const now = new Date();
    await this.prisma.proofOfPlayLog.create({
      data: {
        organizationId,
        deviceId,
        device: deviceName,
        content: assetName,
        assetName,
        status: ProofOfPlayStatus.VERIFIED,
        timestamp: now,
        startTime: now,
        durationSeconds: 60,
        endTime: new Date(now.getTime() + 60_000),
      },
    });
  }

  /**
   * Return the active playlist manifest with incremental sync support.
   * When playlistVersion matches the server version, returns unchanged=true with no asset payloads.
   */
  async syncPlaylist(authHeader: string | undefined, query: SyncQueryDto = {}) {
    const device = await this.resolveDeviceByToken(authHeader);
    const knownAssetIds = this.parseCommaSeparatedIds(query.knownAssetIds);
    const clientAssetVersions = this.parseAssetVersionMap(query.assetVersions);
    const tickers = await this.fetchActiveTickers(device.organizationId, device.id);

    if (!device.currentPlaylistId) {
      const removedAssetIds = knownAssetIds;
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
        campaignLinks: {
          orderBy: { position: 'asc' },
          include: {
            campaign: {
              include: {
                campaignAssets: {
                  orderBy: { position: 'asc' },
                  include: { asset: true },
                },
              },
            },
          },
        },
      },
    });

    if (!playlist) {
      const removedAssetIds = knownAssetIds;
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

    const manifest = await this.buildPlaylistManifest(playlist, clientAssetVersions);
    const currentAssetIds = manifest.map((entry) => entry.id);
    const removedAssetIds = knownAssetIds.filter((id) => !currentAssetIds.includes(id));

    const playlistUnchanged =
      query.playlistVersion !== undefined && query.playlistVersion === playlist.syncVersion;

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSync: new Date().toISOString(),
        lastAckedPlaylistVersion: playlist.syncVersion,
      },
    });

    if (playlistUnchanged) {
      return {
        unchanged: true,
        playlistVersion: playlist.syncVersion,
        playlist: { id: playlist.id, name: playlist.name },
        assets: [],
        currentAssetIds,
        removedAssetIds,
        tickers,
      };
    }

    return {
      unchanged: false,
      playlistVersion: playlist.syncVersion,
      playlist: { id: playlist.id, name: playlist.name },
      assets: manifest,
      currentAssetIds,
      removedAssetIds,
      tickers,
    };
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
      text: ticker.text,
      speed: ticker.speed,
      color: ticker.color,
      backgroundColor: ticker.backgroundColor,
      position: ticker.position,
      priority: ticker.priority,
    }));
  }

  private async buildPlaylistManifest(
    playlist: {
      campaignLinks: {
        campaign: {
          campaignAssets: {
            durationSeconds: number;
            asset: {
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
            };
          }[];
        };
      }[];
    },
    clientAssetVersions: Map<string, number>,
  ) {
    const manifest: {
      id: string;
      name: string;
      type: string;
      mimeType: string;
      durationSeconds: number;
      position: number;
      assetVersion: number;
      updatedAt: string;
      contentHash: string | null;
      requiresDownload: boolean;
      downloadUrl: string | null;
      url: string | null;
      fileSize: number;
    }[] = [];

    let globalPosition = 0;
    for (const link of playlist.campaignLinks) {
      for (const campaignAsset of link.campaign.campaignAssets) {
        const asset = campaignAsset.asset;
        const isUrlAsset = asset.type === 'URL';
        const clientVersion = clientAssetVersions.get(asset.id);
        const requiresDownload =
          !isUrlAsset &&
          asset.status === 'READY' &&
          !!asset.s3Key &&
          (clientVersion === undefined || clientVersion < asset.contentVersion);

        const downloadUrl =
          requiresDownload && asset.s3Key
            ? await this.s3.generateDownloadUrl(asset.s3Key, SYNC_DOWNLOAD_URL_TTL_SECONDS)
            : null;

        manifest.push({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          mimeType: asset.mimeType,
          durationSeconds: campaignAsset.durationSeconds,
          position: globalPosition++,
          assetVersion: asset.contentVersion,
          updatedAt: asset.updatedAt.toISOString(),
          contentHash: asset.contentHash,
          requiresDownload,
          downloadUrl,
          url: asset.url ?? null,
          fileSize: asset.fileSize,
        });
      }
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

      return [
        {
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
        },
      ];
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
