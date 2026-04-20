import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CampaignStatus,
  DeviceStatus,
  PlaylistStatus,
  ProofOfPlayStatus,
  SchedulePriority,
  ScheduleStatus,
  TickerPriority,
  TickerSpeed,
  TickerStatus,
  TickerStyle,
} from '@prisma/client';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

const campaignPalette = ['#4ade80', '#00e5ff', '#a78bfa', '#f472b6', '#fb923c', '#60a5fa'];

type PlaylistDto = {
  id: string;
  name: string;
  status: string;
  items: { id: string; name: string; type: string; duration: number }[];
  screens: number;
  totalDuration: string;
  lastPlayed: Date | null;
  color: string;
  campaignIds: string[];
  campaignNames: string[];
  deviceIds: string[];
  deviceNames: string[];
};

@Injectable()
export class ClientDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async dashboard(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const [devices, assets, campaigns, tickers, scheduleEvents, logs] = await Promise.all([
      this.prisma.device.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.asset.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.prisma.campaign.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 4 }),
      this.prisma.ticker.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 4 }),
      this.prisma.scheduleEvent.findMany({ where: { organizationId }, orderBy: { startTime: 'asc' }, take: 4 }),
      this.prisma.proofOfPlayLog.findMany({ where: { organizationId }, orderBy: { timestamp: 'desc' }, take: 8 }),
    ]);

    const onlineDevices = devices.filter((device) => device.status === DeviceStatus.ONLINE).length;
    const warningDevices = devices.filter((device) => device.status === DeviceStatus.WARNING).length;
    const offlineDevices = devices.filter((device) => device.status === DeviceStatus.OFFLINE).length;

    return {
      stats: {
        totalDevices: devices.length,
        onlineDevices,
        warningDevices,
        offlineDevices,
        totalAssets: assets.length,
        activeCampaigns: campaigns.filter((campaign) => campaign.status === CampaignStatus.ACTIVE).length,
        activeTickers: tickers.filter((ticker) => ticker.status === TickerStatus.ACTIVE).length,
      },
      recentActivityLog: logs.map((log) => ({
        id: log.id,
        action: `${log.device} played ${log.content}`,
        time: log.timestamp,
        type: log.status === ProofOfPlayStatus.VERIFIED ? 'success' : 'danger',
      })),
      topDevices: devices.slice(0, 4).map((device) => ({
        name: device.name,
        location: device.location,
        uptime: device.uptime,
        status: this.toLowerStatus(device.status),
      })),
      schedulePreview: scheduleEvents.map((event) => ({
        name: event.name,
        time: `${event.startTime}-${event.endTime}`,
        color: event.color,
        active: event.status === ScheduleStatus.ACTIVE,
      })),
      recentAssets: assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
      })),
    };
  }

  async listCampaigns(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });

    return campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      assetCount: campaign.assetCount,
      status: this.toLowerStatus(campaign.status),
      lastModified: campaign.updatedAt,
      color: campaign.color,
      screens: campaign.screens,
      impressions: String(campaign.impressions),
    }));
  }

  async createCampaign(actor: RequestActor, body: { name: string; description?: string }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Campaign name is required');

    const count = await this.prisma.campaign.count({ where: { organizationId } });
    const campaign = await this.prisma.campaign.create({
      data: {
        organizationId,
        name,
        description: body.description?.trim() || 'New campaign created.',
        status: CampaignStatus.DRAFT,
        color: campaignPalette[count % campaignPalette.length],
      },
    });

    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      assetCount: campaign.assetCount,
      status: this.toLowerStatus(campaign.status),
      lastModified: campaign.updatedAt,
      color: campaign.color,
      screens: campaign.screens,
      impressions: String(campaign.impressions),
    };
  }

  async deleteCampaign(actor: RequestActor, campaignId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
    if (!existing) throw new NotFoundException('Campaign not found');
    await this.prisma.campaign.delete({ where: { id: campaignId } });
    return { success: true };
  }

  async getCampaignAssets(actor: RequestActor, campaignId: string) {
    const organizationId = this.getOrgId(actor);
    const campaignAssets = await this.prisma.campaignAsset.findMany({
      where: { campaignId, campaign: { organizationId } },
      orderBy: { position: 'asc' },
      include: { asset: true },
    });

    const assetsWithUrls = await Promise.all(
      campaignAssets.map(async (ca) => {
        const downloadUrl =
          ca.asset.status === 'READY'
            ? await this.s3.generateDownloadUrl(ca.asset.s3Key)
            : null;
        return {
          id: ca.asset.id,
          campaignAssetId: ca.id,
          name: ca.asset.name,
          type: ca.asset.type,
          durationSeconds: ca.durationSeconds,
          position: ca.position,
          downloadUrl,
          fileSize: ca.asset.fileSize,
          mimeType: ca.asset.mimeType,
        };
      }),
    );

    return assetsWithUrls;
  }

  async addCampaignAsset(actor: RequestActor, campaignId: string, assetId: string, durationSeconds: number) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    
    // Verify ownership
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, organizationId } });
    if (!campaign || !asset) throw new NotFoundException('Campaign or Asset not found');

    const lastAsset = await this.prisma.campaignAsset.findFirst({
      where: { campaignId },
      orderBy: { position: 'desc' },
    });
    const position = lastAsset ? lastAsset.position + 1 : 0;

    const ca = await this.prisma.campaignAsset.create({
      data: {
        campaignId,
        assetId,
        durationSeconds: durationSeconds || 10,
        position,
      },
      include: { asset: true },
    });

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { assetCount: { increment: 1 } },
    });

    return { success: true, campaignAssetId: ca.id };
  }

  async removeCampaignAsset(actor: RequestActor, campaignId: string, assetId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    
    const ca = await this.prisma.campaignAsset.findUnique({
      where: { campaignId_assetId: { campaignId, assetId } },
      include: { campaign: true },
    });

    if (!ca || ca.campaign.organizationId !== organizationId) {
      throw new NotFoundException('Campaign asset not found');
    }

    await this.prisma.campaignAsset.delete({
      where: { id: ca.id },
    });

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { assetCount: { decrement: 1 } },
    });

    return { success: true };
  }

  async reorderCampaignAssets(actor: RequestActor, campaignId: string, body: { assetIds: string[] }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    for (const [index, assetId] of body.assetIds.entries()) {
      // Find the specific campaignAsset by campaign and asset
      await this.prisma.campaignAsset.update({
        where: { campaignId_assetId: { campaignId, assetId } },
        data: { position: index },
      });
    }

    return { success: true };
  }

  async listPlaylists(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const playlists = await this.prisma.playlist.findMany({
      where: { organizationId },
      include: {
        items: { orderBy: { position: 'asc' } },
        campaignLinks: {
          orderBy: { position: 'asc' },
          include: { campaign: { select: { id: true, name: true } } },
        },
        devices: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return playlists.map((playlist) => this.serializePlaylist(playlist));
  }

  async createPlaylist(actor: RequestActor, body: { name: string }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Playlist name is required');

    const count = await this.prisma.playlist.count({ where: { organizationId } });
    const playlist = await this.prisma.playlist.create({
      data: {
        organizationId,
        name,
        status: PlaylistStatus.DRAFT,
        color: campaignPalette[count % campaignPalette.length],
      },
    });

    return {
      id: playlist.id,
      name: playlist.name,
      status: this.toTitleStatus(playlist.status),
      items: [],
      screens: playlist.screens,
      totalDuration: '0:00',
      lastPlayed: null,
      color: playlist.color,
      campaignIds: [],
      campaignNames: [],
      deviceIds: [],
      deviceNames: [],
    };
  }

  async deletePlaylist(actor: RequestActor, playlistId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.playlist.findFirst({ where: { id: playlistId, organizationId } });
    if (!existing) throw new NotFoundException('Playlist not found');
    await this.prisma.playlist.delete({ where: { id: playlistId } });
    return { success: true };
  }

  async reorderPlaylistItems(
    actor: RequestActor,
    playlistId: string,
    body: { itemIds: string[] },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId },
      include: { items: true },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    for (const [index, itemId] of body.itemIds.entries()) {
      await this.prisma.playlistItem.update({
        where: { id: itemId },
        data: { position: index },
      });
    }
    return { success: true };
  }

  async playlistAssignmentOptions(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const [campaigns, devices] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { organizationId },
        select: { id: true, name: true, status: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.device.findMany({
        where: { organizationId },
        select: { id: true, name: true, location: true, status: true, currentPlaylistId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: this.toLowerStatus(campaign.status),
      })),
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        location: device.location,
        status: this.toLowerStatus(device.status),
        currentPlaylistId: device.currentPlaylistId,
      })),
    };
  }

  async assignPlaylist(actor: RequestActor, playlistId: string, body: { campaignIds: string[]; deviceIds: string[] }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const campaignIds = Array.from(new Set(body.campaignIds ?? []));
    const deviceIds = Array.from(new Set(body.deviceIds ?? []));

    const playlist = await this.prisma.playlist.findFirst({ where: { id: playlistId, organizationId } });
    if (!playlist) throw new NotFoundException('Playlist not found');

    if (campaignIds.length > 0) {
      const validCampaignCount = await this.prisma.campaign.count({
        where: { organizationId, id: { in: campaignIds } },
      });
      if (validCampaignCount !== campaignIds.length) {
        throw new BadRequestException('Some campaigns are invalid for this organization');
      }
    }

    if (deviceIds.length > 0) {
      const validDeviceCount = await this.prisma.device.count({
        where: { organizationId, id: { in: deviceIds } },
      });
      if (validDeviceCount !== deviceIds.length) {
        throw new BadRequestException('Some devices are invalid for this organization');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.playlistCampaign.deleteMany({ where: { playlistId } });
      if (campaignIds.length > 0) {
        await tx.playlistCampaign.createMany({
          data: campaignIds.map((campaignId, index) => ({
            playlistId,
            campaignId,
            position: index,
          })),
        });
      }

      await tx.device.updateMany({
        where: { organizationId, currentPlaylistId: playlistId, id: { notIn: deviceIds } },
        data: { currentPlaylistId: null },
      });

      if (deviceIds.length > 0) {
        await tx.device.updateMany({
          where: { organizationId, id: { in: deviceIds } },
          data: { currentPlaylistId: playlistId, currentContent: playlist.name },
        });
      }

      await tx.playlist.update({
        where: { id: playlistId },
        data: { screens: deviceIds.length },
      });
    });

    const updated = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId },
      include: {
        items: { orderBy: { position: 'asc' } },
        campaignLinks: {
          orderBy: { position: 'asc' },
          include: { campaign: { select: { id: true, name: true } } },
        },
        devices: { select: { id: true, name: true } },
      },
    });
    if (!updated) throw new NotFoundException('Playlist not found');

    return this.serializePlaylist(updated);
  }

  async listScheduleEvents(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const events = await this.prisma.scheduleEvent.findMany({
      where: { organizationId },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
    });

    return events.map((event) => ({
      id: event.id,
      name: event.name,
      campaign: event.campaign,
      startTime: event.startTime,
      endTime: event.endTime,
      days: event.days,
      screens: event.screens,
      status: this.toLowerStatus(event.status),
      color: event.color,
      priority: this.toLowerStatus(event.priority),
      recurring: event.recurring,
    }));
  }

  async createScheduleEvent(
    actor: RequestActor,
    body: { name: string; startTime: string; endTime: string; days: string[] },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Schedule name is required');
    if (!body.days?.length) throw new BadRequestException('At least one day is required');

    const count = await this.prisma.scheduleEvent.count({ where: { organizationId } });
    const event = await this.prisma.scheduleEvent.create({
      data: {
        organizationId,
        name,
        campaign: 'New Campaign',
        startTime: body.startTime,
        endTime: body.endTime,
        days: body.days,
        status: ScheduleStatus.SCHEDULED,
        priority: SchedulePriority.NORMAL,
        recurring: true,
        color: campaignPalette[count % campaignPalette.length],
      },
    });

    return {
      id: event.id,
      name: event.name,
      campaign: event.campaign,
      startTime: event.startTime,
      endTime: event.endTime,
      days: event.days,
      screens: event.screens,
      status: this.toLowerStatus(event.status),
      color: event.color,
      priority: this.toLowerStatus(event.priority),
      recurring: event.recurring,
    };
  }

  async deleteScheduleEvent(actor: RequestActor, eventId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.scheduleEvent.findFirst({ where: { id: eventId, organizationId } });
    if (!existing) throw new NotFoundException('Schedule event not found');
    await this.prisma.scheduleEvent.delete({ where: { id: eventId } });
    return { success: true };
  }

  async listDevices(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const devices = await this.prisma.device.findMany({
      where: { organizationId },
      include: { currentPlaylist: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return devices.map((device) => ({
      id: device.id,
      name: device.name,
      status: this.toLowerStatus(device.status),
      location: device.location,
      ip: device.ip,
      resolution: device.resolution,
      uptime: device.uptime,
      cpu: device.cpu,
      ram: device.ram,
      temp: device.temp,
      lastSync: device.lastSync,
      os: device.os,
      currentContent: device.currentPlaylist?.name ?? device.currentContent ?? 'N/A',
    }));
  }

  async listTickers(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const tickers = await this.prisma.ticker.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });

    return tickers.map((ticker) => ({
      id: ticker.id,
      text: ticker.text,
      speed: this.toTitleStatus(ticker.speed),
      style: this.toTitleStatus(ticker.style),
      color: ticker.color,
      status: this.toTitleStatus(ticker.status),
      priority: this.toTitleStatus(ticker.priority),
      screens: ticker.screens,
      createdAt: ticker.createdAt,
    }));
  }

  async createTicker(
    actor: RequestActor,
    body: { text: string; speed: string; priority: string; color: string },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const text = body.text?.trim();
    if (!text) throw new BadRequestException('Ticker text is required');

    const ticker = await this.prisma.ticker.create({
      data: {
        organizationId,
        text,
        speed: this.toTickerSpeed(body.speed),
        style: TickerStyle.NEON,
        color: body.color || '#00e5ff',
        status: TickerStatus.ACTIVE,
        priority: this.toTickerPriority(body.priority),
      },
    });

    return {
      id: ticker.id,
      text: ticker.text,
      speed: this.toTitleStatus(ticker.speed),
      style: this.toTitleStatus(ticker.style),
      color: ticker.color,
      status: this.toTitleStatus(ticker.status),
      priority: this.toTitleStatus(ticker.priority),
      screens: ticker.screens,
      createdAt: ticker.createdAt,
    };
  }

  async toggleTickerStatus(actor: RequestActor, tickerId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const ticker = await this.prisma.ticker.findFirst({ where: { id: tickerId, organizationId } });
    if (!ticker) throw new NotFoundException('Ticker not found');

    const nextStatus = ticker.status === TickerStatus.ACTIVE ? TickerStatus.PAUSED : TickerStatus.ACTIVE;
    const updated = await this.prisma.ticker.update({
      where: { id: tickerId },
      data: { status: nextStatus },
    });

    return {
      id: updated.id,
      status: this.toTitleStatus(updated.status),
    };
  }

  async deleteTicker(actor: RequestActor, tickerId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const ticker = await this.prisma.ticker.findFirst({ where: { id: tickerId, organizationId } });
    if (!ticker) throw new NotFoundException('Ticker not found');
    await this.prisma.ticker.delete({ where: { id: tickerId } });
    return { success: true };
  }

  async reports(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const [devices, logs] = await Promise.all([
      this.prisma.device.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.proofOfPlayLog.findMany({ where: { organizationId }, orderBy: { timestamp: 'desc' }, take: 200 }),
    ]);

    const byDay = new Map<string, { impressions: number; engagement: number }>();
    for (const log of logs) {
      const key = log.timestamp.toLocaleDateString('en-US', { weekday: 'short' });
      const current = byDay.get(key) ?? { impressions: 0, engagement: 0 };
      current.impressions += 1;
      current.engagement += log.status === ProofOfPlayStatus.VERIFIED ? 70 : 30;
      byDay.set(key, current);
    }

    const chartData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
      day,
      impressions: byDay.get(day)?.impressions ?? 0,
      engagement: byDay.get(day)?.engagement ?? 0,
    }));

    return {
      kpis: {
        billedImpressions: logs.length,
        avgEngagement: Math.round(
          logs.reduce((sum, log) => sum + (log.status === ProofOfPlayStatus.VERIFIED ? 34 : 9), 0) /
            Math.max(logs.length, 1),
        ),
        playbackFidelity:
          Math.round(
            (logs.filter((log) => log.status === ProofOfPlayStatus.VERIFIED).length / Math.max(logs.length, 1)) * 10000,
          ) / 100,
        activeNodes: devices.filter((device) => device.status === DeviceStatus.ONLINE).length,
      },
      chartData,
      proofOfPlay: logs.slice(0, 50).map((log) => ({
        id: log.id,
        device: log.device,
        content: log.content,
        timestamp: log.timestamp,
        status: this.toTitleStatus(log.status),
      })),
    };
  }

  private getOrgId(actor: RequestActor) {
    if (!actor.organization?.id) {
      throw new BadRequestException('Missing active organization context');
    }
    return actor.organization.id;
  }

  private assertCanEdit(actor: RequestActor) {
    if (!actor.organization) throw new ForbiddenException('Missing organization context');
    if (actor.organization.role === 'ANALYST_VIEWER') throw new ForbiddenException('Read-only access');
  }

  private toLowerStatus(value: string) {
    return value.toLowerCase();
  }

  private toTitleStatus(value: string) {
    return value
      .toLowerCase()
      .split('_')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  }

  private formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private toTickerSpeed(speed: string) {
    if (speed.toLowerCase() === 'slow') return TickerSpeed.SLOW;
    if (speed.toLowerCase() === 'fast') return TickerSpeed.FAST;
    return TickerSpeed.NORMAL;
  }

  private toTickerPriority(priority: string) {
    if (priority.toLowerCase() === 'urgent') return TickerPriority.URGENT;
    if (priority.toLowerCase() === 'low') return TickerPriority.LOW;
    return TickerPriority.NORMAL;
  }

  private serializePlaylist(playlist: {
    id: string;
    name: string;
    status: PlaylistStatus;
    items: { id: string; name: string; type: string; durationSeconds: number }[];
    screens: number;
    lastPlayedAt: Date | null;
    color: string;
    campaignLinks: { campaign: { id: string; name: string } }[];
    devices: { id: string; name: string }[];
  }): PlaylistDto {
    const totalSeconds = playlist.items.reduce((sum, item) => sum + item.durationSeconds, 0);
    return {
      id: playlist.id,
      name: playlist.name,
      status: this.toTitleStatus(playlist.status),
      items: playlist.items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        duration: item.durationSeconds,
      })),
      screens: playlist.devices.length || playlist.screens,
      totalDuration: this.formatDuration(totalSeconds),
      lastPlayed: playlist.lastPlayedAt,
      color: playlist.color,
      campaignIds: playlist.campaignLinks.map((link) => link.campaign.id),
      campaignNames: playlist.campaignLinks.map((link) => link.campaign.name),
      deviceIds: playlist.devices.map((device) => device.id),
      deviceNames: playlist.devices.map((device) => device.name),
    };
  }
}
