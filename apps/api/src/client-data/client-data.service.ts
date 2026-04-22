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

    return events.map((event) => this.serializeScheduleEvent(event));
  }

  async createScheduleEvent(
    actor: RequestActor,
    body: {
      name: string;
      campaign?: string;
      startTime: string;
      endTime: string;
      days: string[];
      screens?: number;
      status?: string;
      priority?: string;
      recurring?: boolean;
      color?: string;
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Schedule name is required');
    if (!body.days?.length) throw new BadRequestException('At least one day is required');
    if (!this.isValidTime(body.startTime) || !this.isValidTime(body.endTime)) {
      throw new BadRequestException('Start and end time must be in HH:MM 24h format');
    }
    if (this.timeToMinutes(body.endTime) <= this.timeToMinutes(body.startTime)) {
      throw new BadRequestException('End time must be later than start time');
    }

    const count = await this.prisma.scheduleEvent.count({ where: { organizationId } });
    const event = await this.prisma.scheduleEvent.create({
      data: {
        organizationId,
        name,
        campaign: body.campaign?.trim() || 'Unassigned',
        startTime: body.startTime,
        endTime: body.endTime,
        days: body.days,
        screens: body.screens ?? 0,
        status: this.toScheduleStatus(body.status),
        priority: this.toSchedulePriority(body.priority),
        recurring: body.recurring ?? true,
        color: this.sanitizeHexColor(body.color, campaignPalette[count % campaignPalette.length]),
      },
    });

    return this.serializeScheduleEvent(event);
  }

  async updateScheduleEvent(
    actor: RequestActor,
    eventId: string,
    body: {
      name?: string;
      campaign?: string;
      startTime?: string;
      endTime?: string;
      days?: string[];
      screens?: number;
      status?: string;
      priority?: string;
      recurring?: boolean;
      color?: string;
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.scheduleEvent.findFirst({ where: { id: eventId, organizationId } });
    if (!existing) throw new NotFoundException('Schedule event not found');

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) throw new BadRequestException('Schedule name cannot be empty');
      data.name = trimmed;
    }
    if (body.campaign !== undefined) data.campaign = body.campaign.trim() || 'Unassigned';
    if (body.startTime !== undefined) {
      if (!this.isValidTime(body.startTime)) throw new BadRequestException('startTime must be HH:MM');
      data.startTime = body.startTime;
    }
    if (body.endTime !== undefined) {
      if (!this.isValidTime(body.endTime)) throw new BadRequestException('endTime must be HH:MM');
      data.endTime = body.endTime;
    }
    const nextStart = (data.startTime as string | undefined) ?? existing.startTime;
    const nextEnd = (data.endTime as string | undefined) ?? existing.endTime;
    if (this.timeToMinutes(nextEnd) <= this.timeToMinutes(nextStart)) {
      throw new BadRequestException('End time must be later than start time');
    }
    if (body.days !== undefined) {
      if (!body.days.length) throw new BadRequestException('At least one day is required');
      data.days = body.days;
    }
    if (body.screens !== undefined) data.screens = Math.max(0, body.screens);
    if (body.status !== undefined) data.status = this.toScheduleStatus(body.status);
    if (body.priority !== undefined) data.priority = this.toSchedulePriority(body.priority);
    if (body.recurring !== undefined) data.recurring = body.recurring;
    if (body.color !== undefined) data.color = this.sanitizeHexColor(body.color, existing.color);

    const updated = await this.prisma.scheduleEvent.update({
      where: { id: eventId },
      data,
    });

    return this.serializeScheduleEvent(updated);
  }

  async toggleScheduleStatus(actor: RequestActor, eventId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.scheduleEvent.findFirst({ where: { id: eventId, organizationId } });
    if (!existing) throw new NotFoundException('Schedule event not found');

    const next =
      existing.status === ScheduleStatus.ACTIVE
        ? ScheduleStatus.PAUSED
        : existing.status === ScheduleStatus.PAUSED
          ? ScheduleStatus.ACTIVE
          : ScheduleStatus.ACTIVE;

    const updated = await this.prisma.scheduleEvent.update({
      where: { id: eventId },
      data: { status: next },
    });

    return this.serializeScheduleEvent(updated);
  }

  async deleteScheduleEvent(actor: RequestActor, eventId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.scheduleEvent.findFirst({ where: { id: eventId, organizationId } });
    if (!existing) throw new NotFoundException('Schedule event not found');
    await this.prisma.scheduleEvent.delete({ where: { id: eventId } });
    return { success: true };
  }

  private serializeScheduleEvent(event: {
    id: string;
    name: string;
    campaign: string;
    startTime: string;
    endTime: string;
    days: string[];
    screens: number;
    status: ScheduleStatus;
    color: string;
    priority: SchedulePriority;
    recurring: boolean;
  }) {
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

  private toScheduleStatus(value?: string): ScheduleStatus {
    switch ((value ?? '').toLowerCase()) {
      case 'active':
        return ScheduleStatus.ACTIVE;
      case 'paused':
        return ScheduleStatus.PAUSED;
      case 'completed':
        return ScheduleStatus.COMPLETED;
      default:
        return ScheduleStatus.SCHEDULED;
    }
  }

  private toSchedulePriority(value?: string): SchedulePriority {
    switch ((value ?? '').toLowerCase()) {
      case 'high':
        return SchedulePriority.HIGH;
      case 'low':
        return SchedulePriority.LOW;
      default:
        return SchedulePriority.NORMAL;
    }
  }

  private isValidTime(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  private timeToMinutes(value: string): number {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }

  private sanitizeHexColor(value: string | undefined, fallback: string): string {
    if (!value) return fallback;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : fallback;
  }

  async listDevices(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const devices = await this.prisma.device.findMany({
      where: { organizationId },
      include: { currentPlaylist: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return devices.map((device) => this.serializeDevice(device));
  }

  async createDevice(
    actor: RequestActor,
    body: { name: string; location: string; resolution?: string; os?: string; ip?: string },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const name = body.name?.trim();
    const location = body.location?.trim();
    if (!name) throw new BadRequestException('Device name is required');
    if (!location) throw new BadRequestException('Device location is required');

    const existing = await this.prisma.device.findFirst({
      where: { organizationId, name },
    });
    if (existing) {
      throw new BadRequestException('A device with this name already exists');
    }

    const device = await this.prisma.device.create({
      data: {
        organizationId,
        name,
        location,
        status: DeviceStatus.OFFLINE,
        ip: body.ip?.trim() || 'Pending',
        resolution: body.resolution?.trim() || '1920x1080',
        uptime: '0s',
        cpu: 0,
        ram: 0,
        temp: 0,
        lastSync: 'Awaiting first sync',
        os: body.os?.trim() || 'Unknown',
      },
      include: { currentPlaylist: { select: { name: true } } },
    });

    return this.serializeDevice(device);
  }

  async updateDevice(
    actor: RequestActor,
    deviceId: string,
    body: { name?: string; location?: string; resolution?: string; os?: string; ip?: string },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    const data: {
      name?: string;
      location?: string;
      resolution?: string;
      os?: string;
      ip?: string;
    } = {};
    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) throw new BadRequestException('Device name cannot be empty');
      if (name !== device.name) {
        const clash = await this.prisma.device.findFirst({
          where: { organizationId, name, id: { not: deviceId } },
        });
        if (clash) throw new BadRequestException('A device with this name already exists');
      }
      data.name = name;
    }
    if (typeof body.location === 'string') {
      const location = body.location.trim();
      if (!location) throw new BadRequestException('Device location cannot be empty');
      data.location = location;
    }
    if (typeof body.resolution === 'string' && body.resolution.trim()) {
      data.resolution = body.resolution.trim();
    }
    if (typeof body.os === 'string' && body.os.trim()) {
      data.os = body.os.trim();
    }
    if (typeof body.ip === 'string' && body.ip.trim()) {
      data.ip = body.ip.trim();
    }

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data,
      include: { currentPlaylist: { select: { name: true } } },
    });

    return this.serializeDevice(updated);
  }

  async deleteDevice(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.device.delete({ where: { id: deviceId } });
    return { success: true };
  }

  async rebootDevice(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    // Real-device reboot would be dispatched via the worker/socket channel here.
    // For now we record the request and mark the device as warning until next sync.
    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: DeviceStatus.WARNING,
        lastSync: `Reboot requested at ${new Date().toISOString()}`,
      },
      include: { currentPlaylist: { select: { name: true } } },
    });

    return this.serializeDevice(updated);
  }

  async captureDeviceScreenshot(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    // Screenshot capture is delegated to the player agent in production.
    return {
      deviceId: device.id,
      requestedAt: new Date().toISOString(),
      status: 'queued' as const,
      message: 'Screenshot request queued — it will appear in reports once the player responds.',
    };
  }

  async refreshDeviceStatus(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    // Simulated telemetry pull. The real player agent would push these numbers.
    const cpu = Math.min(99, Math.max(2, Math.round(device.cpu + (Math.random() * 20 - 10))));
    const ram = Math.min(99, Math.max(5, Math.round(device.ram + (Math.random() * 20 - 10))));
    const temp = Math.min(95, Math.max(25, Math.round(device.temp + (Math.random() * 10 - 5))));
    const nextStatus =
      device.status === DeviceStatus.OFFLINE
        ? DeviceStatus.ONLINE
        : cpu > 85 || temp > 80
          ? DeviceStatus.WARNING
          : DeviceStatus.ONLINE;

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        cpu,
        ram,
        temp,
        status: nextStatus,
        lastSync: new Date().toISOString(),
      },
      include: { currentPlaylist: { select: { name: true } } },
    });

    return this.serializeDevice(updated);
  }

  private serializeDevice(device: {
    id: string;
    name: string;
    status: DeviceStatus;
    location: string;
    ip: string;
    resolution: string;
    uptime: string;
    cpu: number;
    ram: number;
    temp: number;
    lastSync: string;
    os: string;
    currentContent: string | null;
    currentPlaylist?: { name: string } | null;
  }) {
    return {
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
    };
  }

  async listTickers(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const tickers = await this.prisma.ticker.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });

    return tickers.map((ticker) => this.serializeTicker(ticker));
  }

  async createTicker(
    actor: RequestActor,
    body: {
      text: string;
      speed?: string;
      priority?: string;
      style?: string;
      status?: string;
      color?: string;
    },
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
        style: this.toTickerStyle(body.style),
        color: this.sanitizeTickerColor(body.color),
        status: this.toTickerStatus(body.status, TickerStatus.ACTIVE),
        priority: this.toTickerPriority(body.priority),
      },
    });

    return this.serializeTicker(ticker);
  }

  async updateTicker(
    actor: RequestActor,
    tickerId: string,
    body: {
      text?: string;
      speed?: string;
      priority?: string;
      style?: string;
      status?: string;
      color?: string;
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.ticker.findFirst({
      where: { id: tickerId, organizationId },
    });
    if (!existing) throw new NotFoundException('Ticker not found');

    const data: {
      text?: string;
      speed?: TickerSpeed;
      priority?: TickerPriority;
      style?: TickerStyle;
      status?: TickerStatus;
      color?: string;
    } = {};

    if (typeof body.text === 'string') {
      const trimmed = body.text.trim();
      if (!trimmed) throw new BadRequestException('Ticker text is required');
      data.text = trimmed;
    }
    if (body.speed !== undefined) data.speed = this.toTickerSpeed(body.speed);
    if (body.priority !== undefined) data.priority = this.toTickerPriority(body.priority);
    if (body.style !== undefined) data.style = this.toTickerStyle(body.style);
    if (body.status !== undefined) data.status = this.toTickerStatus(body.status, existing.status);
    if (body.color !== undefined) data.color = this.sanitizeTickerColor(body.color);

    const updated = await this.prisma.ticker.update({
      where: { id: tickerId },
      data,
    });

    return this.serializeTicker(updated);
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

    return this.serializeTicker(updated);
  }

  async deleteTicker(actor: RequestActor, tickerId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const ticker = await this.prisma.ticker.findFirst({ where: { id: tickerId, organizationId } });
    if (!ticker) throw new NotFoundException('Ticker not found');
    await this.prisma.ticker.delete({ where: { id: tickerId } });
    return { success: true };
  }

  async reports(actor: RequestActor, range = '7d') {
    const organizationId = this.getOrgId(actor);
    const { startDate, bucketCount, bucketMs, formatLabel } = this.resolveReportRange(range);

    const [devices, logs] = await Promise.all([
      this.prisma.device.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.proofOfPlayLog.findMany({
        where: { organizationId, timestamp: { gte: startDate } },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    const verifiedCount = logs.filter((log) => log.status === ProofOfPlayStatus.VERIFIED).length;

    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(startDate.getTime() + index * bucketMs);
      return {
        label: formatLabel(bucketStart),
        impressions: 0,
        verified: 0,
      };
    });
    for (const log of logs) {
      const offset = log.timestamp.getTime() - startDate.getTime();
      const bucketIndex = Math.min(Math.max(Math.floor(offset / bucketMs), 0), bucketCount - 1);
      buckets[bucketIndex].impressions += 1;
      if (log.status === ProofOfPlayStatus.VERIFIED) {
        buckets[bucketIndex].verified += 1;
      }
    }
    const chartData = buckets.map((bucket) => ({
      day: bucket.label,
      impressions: bucket.impressions,
      engagement: bucket.impressions > 0
        ? Math.round((bucket.verified / bucket.impressions) * 100)
        : 0,
    }));

    const deviceByName = new Map(devices.map((device) => [device.name, device]));
    const deviceAgg = new Map<string, {
      id: string | null;
      name: string;
      location: string;
      status: DeviceStatus | null;
      impressions: number;
      verified: number;
      lastPlay: Date | null;
    }>();
    for (const log of logs) {
      const matched = deviceByName.get(log.device);
      const key = matched?.id ?? log.device;
      const current = deviceAgg.get(key) ?? {
        id: matched?.id ?? null,
        name: log.device,
        location: matched?.location ?? 'Unknown',
        status: matched?.status ?? null,
        impressions: 0,
        verified: 0,
        lastPlay: null,
      };
      current.impressions += 1;
      if (log.status === ProofOfPlayStatus.VERIFIED) current.verified += 1;
      if (!current.lastPlay || log.timestamp > current.lastPlay) current.lastPlay = log.timestamp;
      deviceAgg.set(key, current);
    }
    const deviceBreakdown = Array.from(deviceAgg.values())
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        location: entry.location,
        status: entry.status ? this.toLowerStatus(entry.status) : 'unknown',
        impressions: entry.impressions,
        verifiedRate:
          entry.impressions > 0
            ? Math.round((entry.verified / entry.impressions) * 10000) / 100
            : 0,
        lastPlay: entry.lastPlay,
      }));

    const contentAgg = new Map<string, { content: string; impressions: number; verified: number }>();
    for (const log of logs) {
      const current = contentAgg.get(log.content) ?? {
        content: log.content,
        impressions: 0,
        verified: 0,
      };
      current.impressions += 1;
      if (log.status === ProofOfPlayStatus.VERIFIED) current.verified += 1;
      contentAgg.set(log.content, current);
    }
    const topContent = Array.from(contentAgg.values())
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10)
      .map((entry) => ({
        content: entry.content,
        impressions: entry.impressions,
        verifiedRate:
          entry.impressions > 0
            ? Math.round((entry.verified / entry.impressions) * 10000) / 100
            : 0,
      }));

    return {
      range,
      rangeStart: startDate,
      rangeEnd: new Date(),
      kpis: {
        billedImpressions: logs.length,
        avgEngagement: Math.round(
          logs.reduce((sum, log) => sum + (log.status === ProofOfPlayStatus.VERIFIED ? 34 : 9), 0) /
            Math.max(logs.length, 1),
        ),
        playbackFidelity:
          Math.round((verifiedCount / Math.max(logs.length, 1)) * 10000) / 100,
        activeNodes: devices.filter((device) => device.status === DeviceStatus.ONLINE).length,
        totalNodes: devices.length,
        verifiedCount,
        failedCount: logs.length - verifiedCount,
      },
      chartData,
      deviceBreakdown,
      topContent,
      proofOfPlay: logs.slice(0, 200).map((log) => ({
        id: log.id,
        device: log.device,
        content: log.content,
        timestamp: log.timestamp,
        status: this.toTitleStatus(log.status),
      })),
    };
  }

  async exportReportCsv(actor: RequestActor, range = '7d') {
    const organizationId = this.getOrgId(actor);
    const { startDate } = this.resolveReportRange(range);
    const logs = await this.prisma.proofOfPlayLog.findMany({
      where: { organizationId, timestamp: { gte: startDate } },
      orderBy: { timestamp: 'desc' },
      take: 5000,
    });

    const header = 'Timestamp,Device,Content,Status\n';
    const escape = (value: string) => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    };
    const rows = logs
      .map((log) =>
        [
          log.timestamp.toISOString(),
          escape(log.device),
          escape(log.content),
          this.toTitleStatus(log.status),
        ].join(','),
      )
      .join('\n');

    return header + rows + (rows.length > 0 ? '\n' : '');
  }

  private resolveReportRange(range: string) {
    const now = new Date();
    const normalized = (range ?? '').toLowerCase();

    if (normalized === '24h') {
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return {
        startDate,
        bucketCount: 24,
        bucketMs: 60 * 60 * 1000,
        formatLabel: (date: Date) =>
          date.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false }),
      };
    }

    const days = normalized === '30d' ? 30 : normalized === '90d' ? 90 : 7;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      startDate,
      bucketCount: days,
      bucketMs: 24 * 60 * 60 * 1000,
      formatLabel: (date: Date) =>
        days <= 7
          ? date.toLocaleDateString('en-US', { weekday: 'short' })
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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

  private toTickerSpeed(speed?: string | null) {
    const normalized = (speed ?? '').toLowerCase();
    if (normalized === 'slow') return TickerSpeed.SLOW;
    if (normalized === 'fast') return TickerSpeed.FAST;
    return TickerSpeed.NORMAL;
  }

  private toTickerPriority(priority?: string | null) {
    const normalized = (priority ?? '').toLowerCase();
    if (normalized === 'urgent') return TickerPriority.URGENT;
    if (normalized === 'low') return TickerPriority.LOW;
    return TickerPriority.NORMAL;
  }

  private toTickerStyle(style?: string | null) {
    const normalized = (style ?? '').toLowerCase();
    if (normalized === 'classic') return TickerStyle.CLASSIC;
    if (normalized === 'gradient') return TickerStyle.GRADIENT;
    if (normalized === 'minimal') return TickerStyle.MINIMAL;
    return TickerStyle.NEON;
  }

  private toTickerStatus(status: string | undefined | null, fallback: TickerStatus) {
    const normalized = (status ?? '').toLowerCase();
    if (normalized === 'active') return TickerStatus.ACTIVE;
    if (normalized === 'paused') return TickerStatus.PAUSED;
    if (normalized === 'draft') return TickerStatus.DRAFT;
    return fallback;
  }

  private sanitizeTickerColor(color?: string | null) {
    if (!color) return '#00e5ff';
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#00e5ff';
  }

  private serializeTicker(ticker: {
    id: string;
    text: string;
    speed: TickerSpeed;
    style: TickerStyle;
    color: string;
    status: TickerStatus;
    priority: TickerPriority;
    screens: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
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
      updatedAt: ticker.updatedAt,
    };
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
