import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeviceStatus, ProofOfPlayStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

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
   */
  private async resolveDeviceByToken(authHeader: string | undefined) {
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

    return device;
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

    if (data.currentContent?.trim() && device.organizationId) {
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
   * Return the active playlist manifest with asset download URLs for a device.
   */
  async syncPlaylist(authHeader: string | undefined) {
    const device = await this.resolveDeviceByToken(authHeader);

    if (!device.currentPlaylistId) {
      return { playlist: null, assets: [] };
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

    if (!playlist || playlist.organizationId !== device.organizationId) {
      return { playlist: null, assets: [] };
    }

    // Flatten all assets from all campaigns in the playlist
    const assets: {
      id: string;
      name: string;
      type: string;
      mimeType: string;
      durationSeconds: number;
      position: number;
      downloadUrl: string | null;
      url: string | null;
      fileSize: number;
    }[] = [];

    let globalPosition = 0;
    for (const link of playlist.campaignLinks) {
      for (const campaignAsset of link.campaign.campaignAssets) {
        const isUrlAsset = campaignAsset.asset.type === 'URL';
        const downloadUrl =
          !isUrlAsset &&
          campaignAsset.asset.status === 'READY' &&
          campaignAsset.asset.s3Key
            ? await this.s3.generateDownloadUrl(campaignAsset.asset.s3Key, 86400) // 24h expiry for caching
            : null;

        assets.push({
          id: campaignAsset.asset.id,
          name: campaignAsset.asset.name,
          type: campaignAsset.asset.type,
          mimeType: campaignAsset.asset.mimeType,
          durationSeconds: campaignAsset.durationSeconds,
          position: globalPosition++,
          downloadUrl,
          url: campaignAsset.asset.url ?? null,
          fileSize: campaignAsset.asset.fileSize,
        });
      }
    }

    return {
      playlist: {
        id: playlist.id,
        name: playlist.name,
      },
      assets,
    };
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

    if (!device.organizationId) {
      throw new BadRequestException('Device is not associated with an organization');
    }

    if (!logs?.length) {
      return { received: 0 };
    }

    await this.prisma.proofOfPlayLog.createMany({
      data: logs.map((log) => {
        if (!log.assetName?.trim() && !log.content?.trim()) {
          throw new BadRequestException('Each proof-of-play log requires assetName or content');
        }
        const assetName = (log.assetName ?? log.content ?? 'Unknown asset').trim();
        const startTime = new Date(log.startTime ?? log.timestamp ?? new Date().toISOString());
        let durationSeconds =
          typeof log.durationSeconds === 'number' && log.durationSeconds > 0
            ? Math.floor(log.durationSeconds)
            : null;
        let endTime = log.endTime ? new Date(log.endTime) : null;

        if (!durationSeconds && endTime) {
          durationSeconds = Math.max(
            1,
            Math.round((endTime.getTime() - startTime.getTime()) / 1000),
          );
        }
        if (!endTime && durationSeconds) {
          endTime = new Date(startTime.getTime() + durationSeconds * 1000);
        }

        return {
          organizationId: device.organizationId!,
          deviceId: device.id,
          device: device.name,
          content: assetName,
          assetName,
          playlistName: log.playlistName?.trim() || null,
          campaignName: log.campaignName?.trim() || null,
          status: log.status === 'VERIFIED' ? ProofOfPlayStatus.VERIFIED : ProofOfPlayStatus.FAILED,
          timestamp: startTime,
          startTime,
          endTime,
          durationSeconds,
        };
      }),
    });

    this.logger.log(`Received ${logs.length} PoP logs from device ${device.name}`);

    return { received: logs.length };
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
