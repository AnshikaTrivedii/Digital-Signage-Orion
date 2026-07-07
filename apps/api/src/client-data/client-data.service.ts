import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import {
  AssetStatus,
  AssetType,
  DeviceCacheCommandType,
  DeviceStatus,
  DeviceSystemLogCategory,
  LayoutResolution,
  LayoutStatus,
  PlaylistStatus,
  ProofOfPlayStatus,
  SchedulePriority,
  ScheduleStatus,
  TickerPriority,
  TickerBroadcastScope,
  TickerPosition,
  TickerSpeed,
  TickerStatus,
  TickerStyle,
  ZoneType,
} from '@prisma/client';
import type { RequestActor } from '../common/interfaces/request-with-actor.interface';
import { enrichPopLogFields, expandPopLogPlaybackEvents, PopLogContextIndex } from '../common/pop-log-enrichment';
import { sortPlaylistAssetsBySequence } from '../common/playlist-order';
import { formatReportDateTime } from '../common/format-datetime';
import { storageBytesToNumber } from '../common/device-storage.utils';
import { getPreviewKind } from '../assets/asset-media.utils';
import { DeviceCacheService } from '../device-cache/device-cache.service';
import { DeviceManagementService } from '../device-management/device-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { PlaylistSyncService } from '../sync/playlist-sync.service';

const colorPalette = ['#4ade80', '#00e5ff', '#a78bfa', '#f472b6', '#fb923c', '#60a5fa'];

type PlaylistDto = {
  id: string;
  name: string;
  status: string;
  items: { id: string; name: string; type: string; duration: number }[];
  screens: number;
  totalDuration: string;
  lastPlayed: Date | null;
  color: string;
  assetCount: number;
  deviceIds: string[];
  deviceNames: string[];
};

@Injectable()
export class ClientDataService {
  private readonly logger = new Logger(ClientDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly playlistSync: PlaylistSyncService,
    private readonly deviceCache: DeviceCacheService,
    private readonly deviceManagement: DeviceManagementService,
  ) {}

  async dashboard(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const [devices, assets, playlists, tickers, scheduleEvents, logs, layouts] = await Promise.all([
      this.prisma.device.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.asset.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.prisma.playlist.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 4 }),
      this.prisma.ticker.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 4 }),
      this.prisma.scheduleEvent.findMany({ where: { organizationId }, orderBy: { startTime: 'asc' }, take: 4 }),
      this.prisma.proofOfPlayLog.findMany({ where: { organizationId }, orderBy: { timestamp: 'desc' }, take: 8 }),
      this.prisma.layout.findMany({
        where: { organizationId },
        include: this.layoutReadinessInclude(),
      }),
    ]);

    const onlineDevices = devices.filter((device) => device.status === DeviceStatus.ONLINE).length;
    const warningDevices = devices.filter((device) => device.status === DeviceStatus.WARNING).length;
    const offlineDevices = devices.filter((device) => device.status === DeviceStatus.OFFLINE).length;

    const layoutReadiness = layouts.map((layout) => ({
      layout,
      ...this.computeLayoutReadiness(layout),
    }));
    const layoutsWithIssues = layoutReadiness.filter((entry) => !entry.isPlaybackReady).length;

    return {
      stats: {
        totalDevices: devices.length,
        onlineDevices,
        warningDevices,
        offlineDevices,
        totalAssets: assets.length,
        activePlaylists: playlists.filter((playlist) => playlist.status === PlaylistStatus.ACTIVE).length,
        activeTickers: tickers.filter((ticker) => ticker.status === TickerStatus.ACTIVE).length,
        layoutsWithIssues,
      },
      recentActivityLog: logs.map((log) => ({
        id: log.id,
        action: `${log.device} played ${log.assetName || log.content}`,
        time: log.startTime ?? log.timestamp,
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
        active: this.isScheduleActiveNow(event),
      })),
      recentAssets: assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
      })),
      layoutAlerts: layoutReadiness
        .filter((entry) => !entry.isPlaybackReady)
        .slice(0, 5)
        .map((entry) => ({
          layoutId: entry.layout.id,
          layoutName: entry.layout.name,
          warnings: entry.readinessWarnings,
        })),
    };
  }

  async getPlaylistAssets(actor: RequestActor, playlistId: string) {
    const organizationId = this.getOrgId(actor);
    const playlistAssets = sortPlaylistAssetsBySequence(
      await this.prisma.playlistAsset.findMany({
        where: { playlistId, playlist: { organizationId } },
        orderBy: [{ position: 'asc' }, { assetId: 'asc' }],
        include: { asset: true },
      }),
    );

    return Promise.all(
      playlistAssets.map(async (pa) => ({
        id: pa.asset.id,
        playlistAssetId: pa.id,
        name: pa.asset.name,
        type: pa.asset.type,
        durationSeconds: pa.durationSeconds,
        position: pa.position,
        downloadUrl: await this.resolveAssetDownloadUrl(pa.asset),
        thumbnailUrl: await this.resolveAssetThumbnailUrl(pa.asset),
        fileUrl: pa.asset.type === AssetType.URL ? pa.asset.url : await this.resolveAssetDownloadUrl(pa.asset),
        url: pa.asset.url ?? null,
        fileSize: pa.asset.fileSize,
        mimeType: pa.asset.mimeType,
        documentFormat: pa.asset.documentFormat ?? null,
        defaultDurationSeconds: pa.asset.defaultDurationSeconds ?? null,
        previewKind: this.getAssetPreviewKind(pa.asset),
      })),
    );
  }

  async addPlaylistAsset(actor: RequestActor, playlistId: string, assetId: string, durationSeconds?: number) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const playlist = await this.prisma.playlist.findFirst({ where: { id: playlistId, organizationId } });
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, organizationId } });
    if (!playlist || !asset) throw new NotFoundException('Playlist or Asset not found');
    if (asset.status !== AssetStatus.READY) {
      throw new BadRequestException('Only ready assets can be added to a playlist');
    }

    const existing = await this.prisma.playlistAsset.findUnique({
      where: { playlistId_assetId: { playlistId, assetId } },
    });
    if (existing) {
      throw new BadRequestException('This asset is already in the playlist');
    }

    const defaultDuration = asset.defaultDurationSeconds ?? 10;
    const normalizedDuration = this.normalizeDurationSeconds(durationSeconds ?? defaultDuration);

    const lastAsset = await this.prisma.playlistAsset.findFirst({
      where: { playlistId },
      orderBy: { position: 'desc' },
    });
    const position = lastAsset ? lastAsset.position + 1 : 0;

    const pa = await this.prisma.playlistAsset.create({
      data: {
        playlistId,
        assetId,
        durationSeconds: normalizedDuration,
        position,
      },
      include: { asset: true },
    });

    await this.playlistSync.bumpPlaylist(playlistId);

    return { success: true, playlistAssetId: pa.id, durationSeconds: pa.durationSeconds };
  }

  async updatePlaylistAssetDuration(
    actor: RequestActor,
    playlistId: string,
    assetId: string,
    durationSeconds: number,
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const normalizedDuration = this.normalizeDurationSeconds(durationSeconds);

    const playlistAsset = await this.prisma.playlistAsset.findUnique({
      where: { playlistId_assetId: { playlistId, assetId } },
      include: { playlist: true, asset: true },
    });

    if (!playlistAsset || playlistAsset.playlist.organizationId !== organizationId) {
      throw new NotFoundException('Playlist asset not found');
    }

    const previousDuration = playlistAsset.durationSeconds;

    const updated = await this.prisma.playlistAsset.update({
      where: { id: playlistAsset.id },
      data: { durationSeconds: normalizedDuration },
      include: { asset: true },
    });

    await this.playlistSync.bumpPlaylist(playlistId, 'duration-updated');

    this.logger.log(
      `Playlist asset duration updated playlistId=${playlistId} assetId=${assetId} ` +
        `previousDuration=${previousDuration}s newDuration=${updated.durationSeconds}s position=${updated.position}`,
    );

    return {
      id: updated.asset.id,
      playlistAssetId: updated.id,
      name: updated.asset.name,
      type: updated.asset.type,
      durationSeconds: updated.durationSeconds,
      position: updated.position,
      downloadUrl: await this.resolveAssetDownloadUrl(updated.asset),
      url: updated.asset.url ?? null,
      fileSize: updated.asset.fileSize,
      mimeType: updated.asset.mimeType,
    };
  }

  async removePlaylistAsset(actor: RequestActor, playlistId: string, assetId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const pa = await this.prisma.playlistAsset.findUnique({
      where: { playlistId_assetId: { playlistId, assetId } },
      include: { playlist: true },
    });

    if (!pa || pa.playlist.organizationId !== organizationId) {
      throw new NotFoundException('Playlist asset not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.playlistAsset.delete({
        where: { id: pa.id },
      });
      await this.compactPlaylistAssetPositions(playlistId, tx);
    });

    await this.playlistSync.bumpPlaylist(playlistId);

    return { success: true };
  }

  async reorderPlaylistAssets(actor: RequestActor, playlistId: string, body: { assetIds: string[] }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const playlist = await this.prisma.playlist.findFirst({ where: { id: playlistId, organizationId } });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const existingAssets = await this.prisma.playlistAsset.findMany({
      where: { playlistId },
      select: { assetId: true },
    });
    const existingAssetIds = new Set(existingAssets.map((entry) => entry.assetId));

    if (body.assetIds.length !== existingAssetIds.size) {
      throw new BadRequestException('assetIds must include every playlist asset exactly once');
    }

    const seen = new Set<string>();
    for (const assetId of body.assetIds) {
      if (!existingAssetIds.has(assetId)) {
        throw new BadRequestException('Invalid asset id in reorder payload');
      }
      if (seen.has(assetId)) {
        throw new BadRequestException('assetIds must not contain duplicates');
      }
      seen.add(assetId);
    }

    await this.prisma.$transaction(
      body.assetIds.map((assetId, index) =>
        this.prisma.playlistAsset.update({
          where: { playlistId_assetId: { playlistId, assetId } },
          data: { position: index },
        }),
      ),
    );

    await this.playlistSync.bumpPlaylist(playlistId);

    return { success: true };
  }

  async listPlaylists(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const playlists = await this.prisma.playlist.findMany({
      where: { organizationId },
      include: {
        items: { orderBy: { position: 'asc' } },
        playlistAssets: { orderBy: { position: 'asc' } },
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
        color: colorPalette[count % colorPalette.length],
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
      assetCount: 0,
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

    await this.playlistSync.bumpPlaylist(playlistId);

    return { success: true };
  }

  async playlistAssignmentOptions(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const devices = await this.prisma.device.findMany({
      where: { organizationId, isPaired: true },
      select: { id: true, name: true, location: true, status: true, currentPlaylistId: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        location: device.location,
        status: this.toLowerStatus(device.status),
        currentPlaylistId: device.currentPlaylistId,
      })),
    };
  }

  async assignPlaylist(actor: RequestActor, playlistId: string, body: { deviceIds: string[] }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const deviceIds = Array.from(new Set(body.deviceIds ?? []));

    const playlist = await this.prisma.playlist.findFirst({ where: { id: playlistId, organizationId } });
    if (!playlist) throw new NotFoundException('Playlist not found');

    if (deviceIds.length > 0) {
      const validDeviceCount = await this.prisma.device.count({
        where: { organizationId, isPaired: true, id: { in: deviceIds } },
      });
      if (validDeviceCount !== deviceIds.length) {
        throw new BadRequestException('Some devices are invalid or not paired for this organization');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.device.updateMany({
        where: { organizationId, currentPlaylistId: playlistId, id: { notIn: deviceIds } },
        data: { currentPlaylistId: null },
      });

      if (deviceIds.length > 0) {
        await tx.device.updateMany({
          where: { organizationId, id: { in: deviceIds } },
          data: {
            currentPlaylistId: playlistId,
            currentLayoutId: null,
            currentContent: playlist.name,
            lastAckedPlaylistVersion: null,
            lastAckedLayoutVersion: null,
          },
        });
      }

      await tx.playlist.update({
        where: { id: playlistId },
        data: {
          screens: deviceIds.length,
          syncVersion: { increment: 1 },
        },
      });
    });

    const updated = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId },
      include: {
        items: { orderBy: { position: 'asc' } },
        playlistAssets: { orderBy: { position: 'asc' } },
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
      include: {
        playlist: { select: { id: true, name: true } },
        deviceTargets: { include: { device: { select: { id: true, name: true } } } },
      },
    });

    return events.map((event) => this.serializeScheduleEvent(event));
  }

  async createScheduleEvent(
    actor: RequestActor,
    body: {
      name: string;
      campaign?: string;
      playlistId?: string;
      startTime: string;
      endTime: string;
      days: string[];
      screens?: number;
      broadcastScope?: string;
      deviceIds?: string[];
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

    const playlist = await this.resolveSchedulePlaylist(organizationId, body.playlistId);
    const broadcastScope = this.toTickerBroadcastScope(body.broadcastScope);
    const selectedDeviceIds = await this.resolveScheduleDeviceIds(
      organizationId,
      broadcastScope,
      body.deviceIds,
    );
    const screens = await this.countScheduleReach(organizationId, broadcastScope, selectedDeviceIds);

    const count = await this.prisma.scheduleEvent.count({ where: { organizationId } });
    const event = await this.prisma.scheduleEvent.create({
      data: {
        organizationId,
        name,
        campaign: body.campaign?.trim() || playlist?.name || 'Unassigned',
        playlistId: playlist?.id ?? null,
        startTime: body.startTime,
        endTime: body.endTime,
        days: body.days,
        screens,
        broadcastScope,
        status: this.toScheduleStatus(body.status),
        priority: this.toSchedulePriority(body.priority),
        recurring: body.recurring ?? true,
        color: this.sanitizeHexColor(body.color, colorPalette[count % colorPalette.length]),
        deviceTargets:
          broadcastScope === TickerBroadcastScope.SELECTED_DEVICES
            ? {
                create: selectedDeviceIds.map((deviceId) => ({ deviceId })),
              }
            : undefined,
      },
      include: {
        playlist: { select: { id: true, name: true } },
        deviceTargets: { include: { device: { select: { id: true, name: true } } } },
      },
    });

    await this.applySchedulePlaybackIfDue(organizationId, event);
    return this.serializeScheduleEvent(event);
  }

  async updateScheduleEvent(
    actor: RequestActor,
    eventId: string,
    body: {
      name?: string;
      campaign?: string;
      playlistId?: string;
      startTime?: string;
      endTime?: string;
      days?: string[];
      screens?: number;
      broadcastScope?: string;
      deviceIds?: string[];
      status?: string;
      priority?: string;
      recurring?: boolean;
      color?: string;
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.scheduleEvent.findFirst({
      where: { id: eventId, organizationId },
      include: {
        playlist: { select: { id: true, name: true } },
        deviceTargets: { include: { device: { select: { id: true, name: true } } } },
      },
    });
    if (!existing) throw new NotFoundException('Schedule event not found');

    const data: Prisma.ScheduleEventUpdateInput = {};
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) throw new BadRequestException('Schedule name cannot be empty');
      data.name = trimmed;
    }
    if (body.playlistId !== undefined) {
      const playlist = await this.resolveSchedulePlaylist(organizationId, body.playlistId || null);
      data.playlist = playlist ? { connect: { id: playlist.id } } : { disconnect: true };
      data.campaign = playlist?.name ?? existing.campaign;
    } else if (body.campaign !== undefined) {
      data.campaign = body.campaign.trim() || existing.campaign;
    }
    if (body.startTime !== undefined) {
      if (!this.isValidTime(body.startTime)) throw new BadRequestException('startTime must be HH:MM');
      data.startTime = body.startTime;
    }
    if (body.endTime !== undefined) {
      if (!this.isValidTime(body.endTime)) throw new BadRequestException('endTime must be HH:MM');
      data.endTime = body.endTime;
    }
    const nextStart = body.startTime ?? existing.startTime;
    const nextEnd = body.endTime ?? existing.endTime;
    if (this.timeToMinutes(nextEnd) <= this.timeToMinutes(nextStart)) {
      throw new BadRequestException('End time must be later than start time');
    }
    if (body.days !== undefined) {
      if (!body.days.length) throw new BadRequestException('At least one day is required');
      data.days = body.days;
    }
    if (body.status !== undefined) data.status = this.toScheduleStatus(body.status);
    if (body.priority !== undefined) data.priority = this.toSchedulePriority(body.priority);
    if (body.recurring !== undefined) data.recurring = body.recurring;
    if (body.color !== undefined) data.color = this.sanitizeHexColor(body.color, existing.color);

    const nextBroadcastScope =
      body.broadcastScope !== undefined
        ? this.toTickerBroadcastScope(body.broadcastScope)
        : existing.broadcastScope;
    if (body.broadcastScope !== undefined) {
      data.broadcastScope = nextBroadcastScope;
    }

    const shouldRefreshTargets =
      body.broadcastScope !== undefined || body.deviceIds !== undefined;
    if (shouldRefreshTargets) {
      const selectedDeviceIds = await this.resolveScheduleDeviceIds(
        organizationId,
        nextBroadcastScope,
        body.deviceIds ?? existing.deviceTargets.map((target) => target.deviceId),
      );
      data.screens = await this.countScheduleReach(organizationId, nextBroadcastScope, selectedDeviceIds);
      data.deviceTargets = {
        deleteMany: {},
        ...(nextBroadcastScope === TickerBroadcastScope.SELECTED_DEVICES
          ? {
              create: selectedDeviceIds.map((deviceId) => ({ deviceId })),
            }
          : {}),
      };
    } else if (body.screens !== undefined) {
      data.screens = Math.max(0, body.screens);
    }

    const updated = await this.prisma.scheduleEvent.update({
      where: { id: eventId },
      data,
      include: {
        playlist: { select: { id: true, name: true } },
        deviceTargets: { include: { device: { select: { id: true, name: true } } } },
      },
    });

    await this.applySchedulePlaybackIfDue(organizationId, updated);
    return this.serializeScheduleEvent(updated);
  }

  async toggleScheduleStatus(actor: RequestActor, eventId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.scheduleEvent.findFirst({
      where: { id: eventId, organizationId },
      include: {
        playlist: { select: { id: true, name: true } },
        deviceTargets: { include: { device: { select: { id: true, name: true } } } },
      },
    });
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
      include: {
        playlist: { select: { id: true, name: true } },
        deviceTargets: { include: { device: { select: { id: true, name: true } } } },
      },
    });

    await this.applySchedulePlaybackIfDue(organizationId, updated);
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
    playlistId?: string | null;
    startTime: string;
    endTime: string;
    days: string[];
    screens: number;
    broadcastScope: TickerBroadcastScope;
    status: ScheduleStatus;
    color: string;
    priority: SchedulePriority;
    recurring: boolean;
    playlist?: { id: string; name: string } | null;
    deviceTargets?: { device: { id: string; name: string } }[];
  }) {
    const deviceTargets = event.deviceTargets ?? [];
    return {
      id: event.id,
      name: event.name,
      campaign: event.campaign,
      playlistId: event.playlistId ?? event.playlist?.id ?? null,
      playlistName: event.playlist?.name ?? null,
      startTime: event.startTime,
      endTime: event.endTime,
      days: event.days,
      screens: event.screens,
      broadcastScope: this.toTitleStatus(event.broadcastScope),
      deviceIds: deviceTargets.map((target) => target.device.id),
      deviceNames: deviceTargets.map((target) => target.device.name),
      status: this.toLowerStatus(event.status),
      color: event.color,
      priority: this.toLowerStatus(event.priority),
      recurring: event.recurring,
      isActiveNow: this.isScheduleActiveNow(event),
    };
  }

  private scheduleDayLabel(now = new Date()) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  }

  private isScheduleActiveNow(
    event: {
      days: string[];
      startTime: string;
      endTime: string;
      status: ScheduleStatus;
    },
    now = new Date(),
  ) {
    if (event.status === ScheduleStatus.PAUSED || event.status === ScheduleStatus.COMPLETED) {
      return false;
    }
    if (!event.days.includes(this.scheduleDayLabel(now))) {
      return false;
    }
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const start = this.timeToMinutes(event.startTime);
    const end = this.timeToMinutes(event.endTime);
    if (currentMinutes < start || currentMinutes >= end) {
      return false;
    }
    return event.status === ScheduleStatus.ACTIVE || event.status === ScheduleStatus.SCHEDULED;
  }

  private async resolveSchedulePlaylist(organizationId: string, playlistId?: string | null) {
    if (!playlistId) return null;
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId },
      select: { id: true, name: true },
    });
    if (!playlist) {
      throw new BadRequestException('Playlist not found for this organization');
    }
    return playlist;
  }

  private async resolveScheduleDeviceIds(
    organizationId: string,
    broadcastScope: TickerBroadcastScope,
    deviceIds?: string[],
  ) {
    if (broadcastScope === TickerBroadcastScope.ALL_DEVICES) {
      return [] as string[];
    }
    return this.resolveTickerDeviceIds(organizationId, broadcastScope, deviceIds);
  }

  private async countScheduleReach(
    organizationId: string,
    broadcastScope: TickerBroadcastScope,
    selectedDeviceIds: string[],
  ) {
    return this.countTickerReach(organizationId, broadcastScope, selectedDeviceIds);
  }

  private async applySchedulePlaybackIfDue(
    organizationId: string,
    event: {
      id: string;
      playlistId: string | null;
      broadcastScope: TickerBroadcastScope;
      status: ScheduleStatus;
      startTime: string;
      endTime: string;
      days: string[];
      deviceTargets?: { deviceId: string }[];
    },
  ) {
    if (!event.playlistId) return;
    if (!this.isScheduleActiveNow(event)) return;

    const deviceIds =
      event.broadcastScope === TickerBroadcastScope.ALL_DEVICES
        ? (
            await this.prisma.device.findMany({
              where: { organizationId, isPaired: true },
              select: { id: true },
            })
          ).map((device) => device.id)
        : (event.deviceTargets ?? []).map((target) => target.deviceId);

    if (deviceIds.length === 0) return;

    const playlist = await this.prisma.playlist.findFirst({
      where: { id: event.playlistId, organizationId },
      select: { id: true, name: true },
    });
    if (!playlist) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.device.updateMany({
        where: { organizationId, currentPlaylistId: playlist.id, id: { notIn: deviceIds } },
        data: { currentPlaylistId: null },
      });
      await tx.device.updateMany({
        where: { organizationId, id: { in: deviceIds } },
        data: {
          currentPlaylistId: playlist.id,
          currentLayoutId: null,
          currentContent: playlist.name,
        },
      });
      await tx.playlist.update({
        where: { id: playlist.id },
        data: {
          screens: deviceIds.length,
          syncVersion: { increment: 1 },
        },
      });
    });
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
      where: { organizationId, isPaired: true },
      include: {
        currentPlaylist: { select: { name: true } },
        currentLayout: { select: { name: true } },
      },
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

    if (data.name && data.name !== device.name) {
      await this.prisma.proofOfPlayLog.updateMany({
        where: { organizationId, deviceId },
        data: { device: data.name },
      });
    }

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

    await this.deviceManagement.queueRemoteAction(
      deviceId,
      organizationId,
      'restart-device',
      actor.userId,
    );
    await this.deviceManagement.recordSystemLog(
      deviceId,
      DeviceSystemLogCategory.RESTART,
      'Device restart requested from CMS',
    );

    const updated = await this.prisma.device.findFirst({
      where: { id: deviceId },
      include: { currentPlaylist: { select: { name: true } } },
    });

    return this.serializeDevice(updated!);
  }

  async captureDeviceScreenshot(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    const result = await this.deviceManagement.queueRemoteAction(
      deviceId,
      organizationId,
      'screenshot',
      actor.userId,
    );

    return {
      deviceId: device.id,
      commandId: result.commandId,
      requestedAt: new Date().toISOString(),
      status: 'queued' as const,
      message: result.message,
      lastScreenshotUrl: device.lastScreenshotUrl,
      lastScreenshotAt: device.lastScreenshotAt?.toISOString() ?? null,
    };
  }

  async refreshDeviceStatus(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({ where: { id: deviceId, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    await this.deviceManagement.queueRemoteAction(
      deviceId,
      organizationId,
      'refresh-status',
      actor.userId,
    );

    const updated = await this.prisma.device.findFirst({
      where: { id: deviceId },
      include: { currentPlaylist: { select: { name: true } }, currentLayout: { select: { name: true } } },
    });

    return this.serializeDevice(updated!);
  }

  async getDeviceStatus(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    const device = await this.deviceManagement.findDevice(deviceId, organizationId);
    return this.deviceManagement.getDeviceStatus(device);
  }

  async getDeviceHealth(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    const device = await this.deviceManagement.findDevice(deviceId, organizationId);
    return this.deviceManagement.getDeviceHealth(device);
  }

  async getDevicePermissions(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    const device = await this.deviceManagement.findDevice(deviceId, organizationId);
    return this.deviceManagement.getDevicePermissions(device);
  }

  async getDeviceSettings(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    const device = await this.deviceManagement.findDevice(deviceId, organizationId);
    return this.deviceManagement.getDeviceSettings(device);
  }

  async getDeviceFeatures(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    const device = await this.deviceManagement.findDevice(deviceId, organizationId);
    return this.deviceManagement.getDeviceFeatures(device);
  }

  async updateDeviceFeatures(
    actor: RequestActor,
    deviceId: string,
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
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    return this.deviceManagement.updateDeviceFeatures(deviceId, organizationId, body);
  }

  async getDeviceLogs(
    actor: RequestActor,
    deviceId: string,
    category?: string,
    limit?: number,
  ) {
    const organizationId = this.getOrgId(actor);
    const parsedCategory = category?.trim().toUpperCase() as import('@prisma/client').DeviceSystemLogCategory | undefined;
    return this.deviceManagement.getDeviceLogs(deviceId, organizationId, parsedCategory, limit);
  }

  async executeDeviceAction(actor: RequestActor, deviceId: string, action: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    return this.deviceManagement.queueRemoteAction(deviceId, organizationId, action, actor.userId);
  }

  async restartPlayer(actor: RequestActor, deviceId: string) {
    return this.executeDeviceAction(actor, deviceId, 'restart-player');
  }

  async getDeviceCacheStatus(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    return this.deviceCache.getCacheStatus(deviceId, organizationId);
  }

  async getDeviceCachedAssets(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    return this.deviceCache.getCachedAssets(deviceId, organizationId);
  }

  async refreshDeviceCacheStatus(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const status = await this.deviceCache.getCacheStatus(deviceId, organizationId);
    const assets = await this.deviceCache.getCachedAssets(deviceId, organizationId);
    return { ...status, assets };
  }

  async forceDeviceSync(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    return this.deviceCache.queueCommand(
      deviceId,
      organizationId,
      DeviceCacheCommandType.FORCE_SYNC,
      actor.userId,
    );
  }

  async clearDeviceCache(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    return this.deviceCache.queueCommand(
      deviceId,
      organizationId,
      DeviceCacheCommandType.CLEAR_CACHE,
      actor.userId,
    );
  }

  async redownloadDevicePlaylist(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    return this.deviceCache.queueCommand(
      deviceId,
      organizationId,
      DeviceCacheCommandType.REDOWNLOAD_PLAYLIST,
      actor.userId,
    );
  }

  /**
   * Pair a draft device using a 6-digit pairing code.
   * Called from the CMS dashboard by an authenticated user.
   */
  async pairDevice(actor: RequestActor, body: { pairingCode: string; name: string }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const code = body.pairingCode?.trim().toUpperCase();
    if (!code || code.length !== 6) {
      throw new BadRequestException('Pairing code must be exactly 6 characters');
    }

    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('Device name is required');
    }

    // Find the draft device by pairing code
    const device = await this.prisma.device.findUnique({
      where: { pairingCode: code },
    });

    if (!device) {
      throw new NotFoundException('No device found with this pairing code. Make sure the code matches what is displayed on the screen.');
    }

    if (device.isPaired) {
      throw new BadRequestException('This device has already been paired');
    }

    // Check name uniqueness within org
    const nameClash = await this.prisma.device.findFirst({
      where: { organizationId, name, id: { not: device.id } },
    });
    if (nameClash) {
      throw new BadRequestException('A device with this name already exists in your organization');
    }

    // Generate a secure device token
    const deviceToken = randomBytes(32).toString('hex');

    // Atomic pair — prevents double-pair race
    const updateResult = await this.prisma.device.updateMany({
      where: { id: device.id, isPaired: false },
      data: {
        organizationId,
        name,
        isPaired: true,
        deviceToken,
        pairingCode: null,
        status: DeviceStatus.ONLINE,
        lastSync: new Date().toISOString(),
      },
    });

    if (updateResult.count === 0) {
      throw new BadRequestException('This device has already been paired');
    }

    const paired = await this.prisma.device.findUniqueOrThrow({
      where: { id: device.id },
      include: { currentPlaylist: { select: { name: true } } },
    });

    return this.serializeDevice(paired);
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
    hardwareId?: string | null;
    playerVersion?: string;
    androidVersion?: string;
    lastSeenAt?: Date | null;
    macAddress?: string;
    deviceModel?: string;
    manufacturer?: string;
    orientation?: string;
    timezone?: string;
    networkStatus?: string;
    wifiSignalStrength?: number;
    currentAsset?: string | null;
    currentPlaylistName?: string | null;
    playbackStatus?: string;
    playbackUptimeSeconds?: number;
    storageTotalBytes?: bigint | number;
    storageFreeBytes?: bigint | number;
    lastScreenshotUrl?: string | null;
    lastScreenshotAt?: Date | null;
    lastSuccessfulSyncAt?: Date | null;
    cachedAssetCount?: number;
    expectedAssetCount?: number;
    cacheUsedBytes?: number;
    pendingDownloadCount?: number;
    cacheLastReportedAt?: Date | null;
    syncReportStatus?: string | null;
    lastDownloadAt?: Date | null;
    currentPlaylist?: { name: string } | null;
    currentLayout?: { name: string } | null;
  }) {
    const effectiveStatus = this.deviceManagement.resolveEffectiveStatus({
      lastSeenAt: device.lastSeenAt ?? null,
      status: device.status,
    } as import('@prisma/client').Device);
    return {
      id: device.id,
      name: device.name,
      status: this.toLowerStatus(effectiveStatus),
      location: device.location,
      ip: device.ip,
      resolution: device.resolution,
      uptime: device.uptime,
      cpu: device.cpu,
      ram: device.ram,
      temp: device.temp,
      lastSync: device.lastSync,
      os: device.androidVersion || device.os,
      deviceId: device.id,
      hardwareId: device.hardwareId ?? null,
      androidVersion: device.androidVersion || device.os,
      playerVersion: device.playerVersion ?? '',
      lastSeen: device.lastSeenAt?.toISOString() ?? null,
      lastSyncTime: device.lastSuccessfulSyncAt?.toISOString()
        ?? device.cacheLastReportedAt?.toISOString()
        ?? (device.lastSync !== 'Awaiting first sync' ? device.lastSync : null),
      macAddress: device.macAddress ?? '',
      deviceModel: device.deviceModel ?? '',
      manufacturer: device.manufacturer ?? '',
      orientation: device.orientation ?? 'LANDSCAPE',
      timezone: device.timezone ?? 'UTC',
      networkStatus: device.networkStatus ?? 'UNKNOWN',
      wifiSignalStrength: device.wifiSignalStrength ?? 0,
      currentAsset: device.currentAsset ?? device.currentContent ?? '—',
      currentPlaylist: device.currentPlaylistName ?? device.currentPlaylist?.name ?? device.currentLayout?.name ?? '—',
      playbackStatus: device.playbackStatus ?? 'UNKNOWN',
      playbackUptimeSeconds: device.playbackUptimeSeconds ?? 0,
      storageTotalBytes: storageBytesToNumber(device.storageTotalBytes),
      storageFreeBytes: storageBytesToNumber(device.storageFreeBytes),
      lastScreenshotUrl: device.lastScreenshotUrl ?? null,
      lastScreenshotAt: device.lastScreenshotAt?.toISOString() ?? null,
      currentContent: device.currentLayout?.name ?? device.currentPlaylist?.name ?? device.currentContent ?? 'N/A',
      cache: {
        cachedAssetCount: device.cachedAssetCount ?? 0,
        expectedAssetCount: device.expectedAssetCount ?? 0,
        storageUsedBytes: device.cacheUsedBytes ?? 0,
        storageUsedLabel: this.deviceCache.formatBytes(device.cacheUsedBytes ?? 0),
        pendingDownloads: device.pendingDownloadCount ?? 0,
        lastReportedAt: device.cacheLastReportedAt?.toISOString() ?? null,
        lastDownloadAt: device.lastDownloadAt?.toISOString() ?? null,
        reportStatus: device.syncReportStatus?.toLowerCase() ?? 'unknown',
        isStale: device.cacheLastReportedAt
          ? Date.now() - device.cacheLastReportedAt.getTime() > 15 * 60 * 1000
          : true,
      },
    };
  }

  async listTickers(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const tickers = await this.prisma.ticker.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      include: {
        deviceTargets: {
          include: { device: { select: { id: true, name: true } } },
        },
      },
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
      backgroundColor?: string;
      position?: string;
      heightPercent?: number;
      broadcastScope?: string;
      deviceIds?: string[];
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const text = body.text?.trim();
    if (!text) throw new BadRequestException('Ticker text is required');

    const broadcastScope = this.toTickerBroadcastScope(body.broadcastScope);
    const selectedDeviceIds = await this.resolveTickerDeviceIds(
      organizationId,
      broadcastScope,
      body.deviceIds,
    );
    const screens = await this.countTickerReach(organizationId, broadcastScope, selectedDeviceIds);

    const ticker = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticker.create({
        data: {
          organizationId,
          text,
          speed: this.toTickerSpeed(body.speed),
          style: this.toTickerStyle(body.style),
          color: this.sanitizeTickerColor(body.color),
          backgroundColor: this.sanitizeTickerColor(body.backgroundColor ?? '#1a1f2e'),
          position: this.toTickerPosition(body.position),
          heightPercent: this.clampTickerHeightPercent(body.heightPercent),
          broadcastScope,
          status: this.toTickerStatus(body.status, TickerStatus.ACTIVE),
          priority: this.toTickerPriority(body.priority),
          screens,
        },
      });

      if (broadcastScope === TickerBroadcastScope.SELECTED_DEVICES) {
        await tx.tickerDevice.createMany({
          data: selectedDeviceIds.map((deviceId) => ({ tickerId: created.id, deviceId })),
        });
      }

      return tx.ticker.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          deviceTargets: {
            include: { device: { select: { id: true, name: true } } },
          },
        },
      });
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
      backgroundColor?: string;
      position?: string;
      heightPercent?: number;
      broadcastScope?: string;
      deviceIds?: string[];
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.ticker.findFirst({
      where: { id: tickerId, organizationId },
      include: {
        deviceTargets: {
          include: { device: { select: { id: true, name: true } } },
        },
      },
    });
    if (!existing) throw new NotFoundException('Ticker not found');

    const data: {
      text?: string;
      speed?: TickerSpeed;
      priority?: TickerPriority;
      style?: TickerStyle;
      status?: TickerStatus;
      color?: string;
      backgroundColor?: string;
      position?: TickerPosition;
      heightPercent?: number;
      broadcastScope?: TickerBroadcastScope;
      screens?: number;
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
    if (body.backgroundColor !== undefined) {
      data.backgroundColor = this.sanitizeTickerColor(body.backgroundColor);
    }
    if (body.position !== undefined) data.position = this.toTickerPosition(body.position);
    if (body.heightPercent !== undefined) {
      data.heightPercent = this.clampTickerHeightPercent(body.heightPercent);
    }

    const nextBroadcastScope =
      body.broadcastScope !== undefined
        ? this.toTickerBroadcastScope(body.broadcastScope)
        : existing.broadcastScope;
    const shouldSyncDevices =
      body.broadcastScope !== undefined || body.deviceIds !== undefined;

    let selectedDeviceIds = existing.deviceTargets.map((target) => target.deviceId);
    if (shouldSyncDevices) {
      selectedDeviceIds = await this.resolveTickerDeviceIds(
        organizationId,
        nextBroadcastScope,
        body.deviceIds ?? (nextBroadcastScope === TickerBroadcastScope.SELECTED_DEVICES
          ? existing.deviceTargets.map((target) => target.deviceId)
          : undefined),
      );
      data.broadcastScope = nextBroadcastScope;
      data.screens = await this.countTickerReach(organizationId, nextBroadcastScope, selectedDeviceIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.ticker.update({
        where: { id: tickerId },
        data,
      });

      if (shouldSyncDevices) {
        await tx.tickerDevice.deleteMany({ where: { tickerId } });
        if (nextBroadcastScope === TickerBroadcastScope.SELECTED_DEVICES) {
          await tx.tickerDevice.createMany({
            data: selectedDeviceIds.map((deviceId) => ({ tickerId, deviceId })),
          });
        }
      }

      return tx.ticker.findUniqueOrThrow({
        where: { id: saved.id },
        include: {
          deviceTargets: {
            include: { device: { select: { id: true, name: true } } },
          },
        },
      });
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
      include: {
        deviceTargets: {
          include: { device: { select: { id: true, name: true } } },
        },
      },
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

  async reports(
    actor: RequestActor,
    query: {
      range?: string;
      startDate?: string;
      endDate?: string;
      deviceId?: string;
      folderId?: string;
      search?: string;
      status?: 'all' | 'verified' | 'failed';
      page?: number;
      limit?: number;
    } = {},
  ) {
    const organizationId = this.getOrgId(actor);
    const range = query.range ?? '7d';
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(500, Math.max(1, query.limit ?? 100));
    const { where, rangeStart, rangeEnd } = await this.buildPopLogWhere(organizationId, query);

    const verifiedWhere: Prisma.ProofOfPlayLogWhereInput = {
      ...where,
      status: ProofOfPlayStatus.VERIFIED,
    };
    const failedWhere: Prisma.ProofOfPlayLogWhereInput = {
      ...where,
      status: ProofOfPlayStatus.FAILED,
    };

    const AGGREGATE_CAP = 20_000;

    const [
      devices,
      campaigns,
      organization,
      totalLogs,
      verifiedCount,
      failedCount,
      durationAgg,
      logs,
      latestLog,
      popStatsByDevice,
    ] = await Promise.all([
      this.prisma.device.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
      this.prisma.assetFolder.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      this.prisma.proofOfPlayLog.count({ where }),
      this.prisma.proofOfPlayLog.count({ where: verifiedWhere }),
      this.prisma.proofOfPlayLog.count({ where: failedWhere }),
      this.prisma.proofOfPlayLog.aggregate({
        where: { ...where, durationSeconds: { not: null, gt: 0 } },
        _avg: { durationSeconds: true },
      }),
      this.prisma.proofOfPlayLog.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.proofOfPlayLog.findFirst({
        where: { organizationId },
        orderBy: { startTime: 'desc' },
        select: { startTime: true, device: true },
      }),
      this.prisma.proofOfPlayLog.groupBy({
        by: ['deviceId'],
        where,
        _count: { _all: true },
        _max: { startTime: true },
      }),
    ]);

    const aggregateLogs =
      totalLogs > 0 && totalLogs <= AGGREGATE_CAP
        ? await this.prisma.proofOfPlayLog.findMany({
            where,
            orderBy: { startTime: 'desc' },
            select: {
              id: true,
              device: true,
              deviceId: true,
              assetName: true,
              content: true,
              playlistName: true,
              campaignName: true,
              status: true,
              startTime: true,
              endTime: true,
              durationSeconds: true,
            },
          })
        : [];

    const contextIndex = await new PopLogContextIndex(this.prisma).load(organizationId);
    const devicePlaylistById = new Map(devices.map((device) => [device.id, device.currentPlaylistId]));
    const expandPopLogs = <
      T extends {
        id: string;
        assetName: string;
        content: string;
        deviceId?: string | null;
        playlistName?: string | null;
        campaignName?: string | null;
        startTime: Date;
        endTime?: Date | null;
        durationSeconds?: number | null;
        status: ProofOfPlayStatus;
      },
    >(
      sourceLogs: T[],
    ) =>
      sourceLogs.flatMap((log) => {
        const assetName = log.assetName || log.content;
        const playbackContext = contextIndex.resolve(
          assetName,
          log.deviceId ? devicePlaylistById.get(log.deviceId) : null,
        );
        const enriched = enrichPopLogFields(
          {
            assetName,
            playlistName: log.playlistName,
            campaignName: log.campaignName,
            startTime: log.startTime,
            endTime: log.endTime,
            durationSeconds: log.durationSeconds,
          },
          playbackContext,
        );
        return expandPopLogPlaybackEvents(
          { ...log, ...enriched },
          playbackContext?.durationSeconds ?? null,
        ).map((entry, index, events) => ({
          ...entry,
          id: events.length > 1 ? `${log.id}#${index + 1}` : log.id,
        }));
      });

    const enrichedAggregateLogs = expandPopLogs(aggregateLogs);
    const enrichedLogs = expandPopLogs(logs);
    const playbackEventCount =
      totalLogs > 0 && totalLogs <= AGGREGATE_CAP
        ? enrichedAggregateLogs.length
        : totalLogs;
    const chartData =
      totalLogs <= AGGREGATE_CAP
        ? this.buildReportChartData(enrichedAggregateLogs, range, rangeStart, rangeEnd)
        : [];
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

    for (const log of enrichedAggregateLogs) {
      const matched = log.deviceId ? devices.find((device) => device.id === log.deviceId) : deviceByName.get(log.device);
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
      if (!current.lastPlay || log.startTime > current.lastPlay) current.lastPlay = log.startTime;
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

    const campaignAgg = new Map<string, {
      id: string | null;
      name: string;
      impressions: number;
      verified: number;
    }>();

    for (const log of enrichedAggregateLogs) {
      const campaignId = log.campaignId ?? null;
      const campaignName = log.campaignName ?? null;
      const key = campaignId ?? `name:${campaignName ?? '__uncategorized__'}`;
      const current = campaignAgg.get(key) ?? {
        id: campaignId,
        name: campaignName ?? 'Uncategorized',
        impressions: 0,
        verified: 0,
      };
      current.impressions += 1;
      if (log.status === ProofOfPlayStatus.VERIFIED) current.verified += 1;
      campaignAgg.set(key, current);
    }

    const campaignBreakdown = Array.from(campaignAgg.values())
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        impressions: entry.impressions,
        verifiedRate:
          entry.impressions > 0
            ? Math.round((entry.verified / entry.impressions) * 10000) / 100
            : 0,
      }));

    const contentAgg = new Map<string, { content: string; impressions: number; verified: number }>();
    for (const log of enrichedAggregateLogs) {
      const label = log.assetName || log.content;
      const current = contentAgg.get(label) ?? {
        content: label,
        impressions: 0,
        verified: 0,
      };
      current.impressions += 1;
      if (log.status === ProofOfPlayStatus.VERIFIED) current.verified += 1;
      contentAgg.set(label, current);
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

    const avgEngagement =
      durationAgg._avg.durationSeconds != null
        ? Math.round(durationAgg._avg.durationSeconds)
        : 0;

    const deviceNameSet = new Set(devices.map((device) => device.name));
    const deviceIdSet = new Set(devices.map((device) => device.id));
    const reportingDevices = await this.prisma.proofOfPlayLog.groupBy({
      by: ['device', 'deviceId'],
      where,
    });
    const reportingDeviceKeys = new Set(
      reportingDevices.map((entry) => entry.deviceId ?? `name:${entry.device}`),
    );
    const popStatsMap = new Map(
      popStatsByDevice
        .filter((entry) => entry.deviceId)
        .map((entry) => [
          entry.deviceId!,
          { count: entry._count._all, lastAt: entry._max.startTime },
        ]),
    );
    const devicePopDiagnostics = devices
      .filter((device) => device.isPaired)
      .map((device) => {
        const stats = popStatsMap.get(device.id);
        const effectiveStatus = this.deviceManagement.resolveEffectiveStatus(device);
        return {
          deviceId: device.id,
          deviceName: device.name,
          status: this.toLowerStatus(effectiveStatus),
          featureProofOfPlay: device.featureProofOfPlay,
          popLogCountInRange: stats?.count ?? 0,
          lastPopLogAtInRange: stats?.lastAt?.toISOString() ?? null,
          isReportingInRange: (stats?.count ?? 0) > 0,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        };
      });
    const activeDevicesWithoutPop = devices
      .filter((device) => device.isPaired && device.featureProofOfPlay)
      .filter((device) => {
        const effectiveStatus = this.deviceManagement.resolveEffectiveStatus(device);
        const isReachable =
          effectiveStatus === DeviceStatus.ONLINE || effectiveStatus === DeviceStatus.WARNING;
        return (
          isReachable &&
          !reportingDeviceKeys.has(device.id) &&
          !reportingDeviceKeys.has(`name:${device.name}`)
        );
      })
      .map((device) => ({
        id: device.id,
        name: device.name,
        status: this.toLowerStatus(this.deviceManagement.resolveEffectiveStatus(device)),
      }));

    const historicalLogDevices = reportingDevices
      .filter((entry) => !entry.deviceId || !deviceIdSet.has(entry.deviceId))
      .filter((entry) => !deviceNameSet.has(entry.device))
      .map((entry) => ({
        id: entry.deviceId,
        name: entry.device,
        isHistorical: true as const,
      }));

    const reportDeviceOptions = [
      ...devices.map((device) => ({ id: device.id, name: device.name, isHistorical: false as const })),
      ...historicalLogDevices
        .filter((entry) => !devices.some((device) => device.id === entry.id))
        .map((entry) => ({
          id: entry.id ?? `historical:${entry.name}`,
          name: entry.name,
          isHistorical: true as const,
        })),
    ];

    return {
      range,
      rangeStart,
      rangeEnd,
      organizationName: organization?.name ?? 'Organization',
      devices: reportDeviceOptions,
      campaigns,
      kpis: {
        billedImpressions: playbackEventCount,
        avgEngagement,
        playbackFidelity:
          Math.round((verifiedCount / Math.max(totalLogs, 1)) * 10000) / 100,
        activeNodes: devices.filter((device) => device.status === DeviceStatus.ONLINE).length,
        totalNodes: devices.length,
        verifiedCount,
        failedCount,
      },
      chartData,
      deviceBreakdown,
      campaignBreakdown,
      topContent,
      proofOfPlay: enrichedLogs.map((log) => this.serializePopLog(log, deviceNameSet, deviceIdSet)),
      proofOfPlayMeta: {
        total: playbackEventCount,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(playbackEventCount / limit)),
        aggregatesTruncated: totalLogs > AGGREGATE_CAP,
        distinctDevicesInRange: reportingDevices.length,
        activeDevicesWithoutPop,
        devicePopDiagnostics,
      },
      lastLogAt: latestLog?.startTime ?? null,
      lastLogDevice: latestLog?.device ?? null,
    };
  }

  async exportReportXlsx(
    actor: RequestActor,
    query: {
      range?: string;
      startDate?: string;
      endDate?: string;
      deviceId?: string;
      folderId?: string;
      search?: string;
      status?: 'all' | 'verified' | 'failed';
      timezone?: string;
    } = {},
  ) {
    const organizationId = this.getOrgId(actor);
    const exportTimeZone = query.timezone?.trim() || 'UTC';
    const { where } = await this.buildPopLogWhere(organizationId, query);
    const [logs, devices] = await Promise.all([
      this.prisma.proofOfPlayLog.findMany({
        where,
        orderBy: { startTime: 'desc' },
      }),
      this.prisma.device.findMany({ where: { organizationId }, select: { id: true, currentPlaylistId: true } }),
    ]);

    const contextIndex = await new PopLogContextIndex(this.prisma).load(organizationId);
    const devicePlaylistById = new Map(devices.map((device) => [device.id, device.currentPlaylistId]));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Proof of Play');
    sheet.columns = [
      { header: 'Device', key: 'device', width: 24 },
      { header: 'Playlist', key: 'playlistName', width: 24 },
      { header: 'Asset', key: 'assetName', width: 28 },
      { header: 'Start Time', key: 'startTime', width: 24 },
      { header: 'End Time', key: 'endTime', width: 24 },
      { header: 'Duration', key: 'duration', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };

    const expandedLogs = logs.flatMap((log) => {
      const assetName = log.assetName || log.content;
      const playbackContext = contextIndex.resolve(
        assetName,
        log.deviceId ? devicePlaylistById.get(log.deviceId) : null,
      );
      const enriched = enrichPopLogFields(
        {
          assetName,
          playlistName: log.playlistName,
          campaignName: log.campaignName,
          startTime: log.startTime,
          endTime: log.endTime,
          durationSeconds: log.durationSeconds,
        },
        playbackContext,
      );
      return expandPopLogPlaybackEvents(
        { ...log, ...enriched },
        playbackContext?.durationSeconds ?? null,
      );
    });

    for (const log of expandedLogs) {
      const assetName = log.assetName || log.content;
      sheet.addRow({
        device: log.device,
        playlistName: log.playlistName ?? '',
        assetName,
        startTime: formatReportDateTime(log.startTime, exportTimeZone),
        endTime: formatReportDateTime(log.endTime, exportTimeZone),
        duration: log.durationSeconds != null ? `${log.durationSeconds}s` : '',
        status: this.toTitleStatus(log.status),
      });
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async getAssetNamesInFolder(organizationId: string, folderId: string) {
    const assets = await this.prisma.asset.findMany({
      where: { organizationId, folderId },
      select: { name: true },
    });
    return assets.map((asset) => asset.name);
  }

  private async buildPopLogWhere(
    organizationId: string,
    query: {
      range?: string;
      startDate?: string;
      endDate?: string;
      deviceId?: string;
      folderId?: string;
      search?: string;
      status?: 'all' | 'verified' | 'failed';
    },
  ) {
    const { rangeStart, rangeEnd } = this.resolveReportDateRange(
      query.range ?? '7d',
      query.startDate,
      query.endDate,
    );
    const andClauses: Prisma.ProofOfPlayLogWhereInput[] = [{ organizationId }];

    if (rangeStart || rangeEnd) {
      andClauses.push({
        startTime: {
          ...(rangeStart ? { gte: rangeStart } : {}),
          ...(rangeEnd ? { lte: rangeEnd } : {}),
        },
      });
    }

    if (query.deviceId) {
      const device = await this.prisma.device.findFirst({
        where: { id: query.deviceId, organizationId },
        select: { id: true, name: true },
      });
      if (!device) {
        // Allow filtering historical logs stored before device deletion (synthetic id)
        if (query.deviceId.startsWith('historical:')) {
          const historicalName = query.deviceId.slice('historical:'.length);
          andClauses.push({ device: historicalName });
        } else {
          andClauses.push({ id: '__no_match__' });
        }
      } else {
        andClauses.push({
          OR: [
            { deviceId: device.id },
            { deviceId: null, device: device.name },
          ],
        });
      }
    }

    if (query.folderId) {
      if (query.folderId === '__uncategorized__') {
        const categorizedAssets = await this.prisma.asset.findMany({
          where: { organizationId, folderId: { not: null } },
          select: { name: true },
        });
        const categorizedNames = categorizedAssets.map((asset) => asset.name);
        const uncategorizedAssets = await this.prisma.asset.findMany({
          where: { organizationId, folderId: null },
          select: { name: true },
        });
        const uncategorizedNames = uncategorizedAssets.map((asset) => asset.name);
        const orConditions: Prisma.ProofOfPlayLogWhereInput[] = [
          { campaignName: null },
          { campaignName: '' },
        ];
        for (const name of uncategorizedNames) {
          orConditions.push(
            { assetName: { equals: name, mode: 'insensitive' } },
            { content: { equals: name, mode: 'insensitive' } },
          );
        }
        if (categorizedNames.length > 0) {
          andClauses.push({
            AND: [
              { OR: orConditions },
              {
                NOT: {
                  OR: categorizedNames.flatMap((name) => [
                    { assetName: { equals: name, mode: 'insensitive' } },
                    { content: { equals: name, mode: 'insensitive' } },
                  ]),
                },
              },
            ],
          });
        } else {
          andClauses.push({ OR: orConditions });
        }
      } else {
        const folder = await this.prisma.assetFolder.findFirst({
          where: { id: query.folderId, organizationId },
          select: { id: true, name: true },
        });
        if (!folder) {
          andClauses.push({ id: '__no_match__' });
        } else {
          const assetNames = await this.getAssetNamesInFolder(organizationId, folder.id);
          const orConditions: Prisma.ProofOfPlayLogWhereInput[] = [
            { campaignName: { equals: folder.name, mode: 'insensitive' } },
          ];
          for (const name of assetNames) {
            orConditions.push(
              { assetName: { equals: name, mode: 'insensitive' } },
              { content: { equals: name, mode: 'insensitive' } },
            );
          }
          andClauses.push({ OR: orConditions });
        }
      }
    }

    if (query.status === 'verified') {
      andClauses.push({ status: ProofOfPlayStatus.VERIFIED });
    } else if (query.status === 'failed') {
      andClauses.push({ status: ProofOfPlayStatus.FAILED });
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      andClauses.push({
        OR: [
          { device: { contains: term, mode: 'insensitive' } },
          { assetName: { contains: term, mode: 'insensitive' } },
          { content: { contains: term, mode: 'insensitive' } },
          { playlistName: { contains: term, mode: 'insensitive' } },
          { campaignName: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    return { where: { AND: andClauses }, rangeStart, rangeEnd };
  }

  private resolveReportDateRange(range: string, startDate?: string, endDate?: string) {
    const now = new Date();
    const normalized = (range ?? '7d').toLowerCase();

    if (normalized === 'custom') {
      const customStart = startDate ? new Date(startDate) : null;
      const customEnd = endDate ? new Date(endDate) : now;
      if (customStart && Number.isNaN(customStart.getTime())) {
        throw new BadRequestException('Invalid startDate');
      }
      if (Number.isNaN(customEnd.getTime())) {
        throw new BadRequestException('Invalid endDate');
      }
      if (customStart && customEnd < customStart) {
        throw new BadRequestException('endDate must be after startDate');
      }
      return {
        rangeStart: customStart,
        rangeEnd: customEnd,
      };
    }

    if (normalized === 'all') {
      return { rangeStart: null, rangeEnd: null };
    }

    if (normalized === 'today') {
      const rangeStart = new Date(now);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(now);
      rangeEnd.setHours(23, 59, 59, 999);
      return { rangeStart, rangeEnd };
    }

    const days = normalized === '30d' ? 30 : normalized === '24h' ? 1 : 7;
    const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { rangeStart, rangeEnd: now };
  }

  private buildReportChartData(
    logs: { status: ProofOfPlayStatus; startTime: Date }[],
    range: string,
    rangeStart: Date | null,
    rangeEnd: Date | null,
  ) {
    const normalized = (range ?? '7d').toLowerCase();
    const end = rangeEnd ?? new Date();
    const start =
      rangeStart ??
      new Date(end.getTime() - (normalized === '30d' ? 30 : normalized === 'today' ? 1 : 7) * 24 * 60 * 60 * 1000);

    if (normalized === 'all' && logs.length > 0) {
      const monthAgg = new Map<string, { label: string; impressions: number; verified: number; sortKey: string }>();
      for (const log of logs) {
        const label = log.startTime.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const sortKey = `${log.startTime.getFullYear()}-${String(log.startTime.getMonth() + 1).padStart(2, '0')}`;
        const current = monthAgg.get(sortKey) ?? { label, impressions: 0, verified: 0, sortKey };
        current.impressions += 1;
        if (log.status === ProofOfPlayStatus.VERIFIED) current.verified += 1;
        monthAgg.set(sortKey, current);
      }
      return Array.from(monthAgg.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .slice(-24)
        .map((bucket) => ({
          day: bucket.label,
          impressions: bucket.impressions,
          engagement:
            bucket.impressions > 0
              ? Math.round((bucket.verified / bucket.impressions) * 100)
              : 0,
        }));
    }

    const bucketMs =
      normalized === 'today'
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
    const bucketCount = Math.max(
      1,
      Math.min(
        normalized === 'today' ? 24 : normalized === '30d' ? 30 : 7,
        Math.ceil((end.getTime() - start.getTime()) / bucketMs),
      ),
    );

    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(start.getTime() + index * bucketMs);
      return {
        label:
          normalized === 'today'
            ? bucketStart.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false })
            : bucketCount <= 7
              ? bucketStart.toLocaleDateString('en-US', { weekday: 'short' })
              : bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        impressions: 0,
        verified: 0,
      };
    });

    for (const log of logs) {
      const offset = log.startTime.getTime() - start.getTime();
      const bucketIndex = Math.min(Math.max(Math.floor(offset / bucketMs), 0), bucketCount - 1);
      buckets[bucketIndex].impressions += 1;
      if (log.status === ProofOfPlayStatus.VERIFIED) {
        buckets[bucketIndex].verified += 1;
      }
    }

    return buckets.map((bucket) => ({
      day: bucket.label,
      impressions: bucket.impressions,
      engagement:
        bucket.impressions > 0
          ? Math.round((bucket.verified / bucket.impressions) * 100)
          : 0,
    }));
  }

  private serializePopLog(
    log: {
    id: string;
    device: string;
    deviceId?: string | null;
    assetName: string;
    content: string;
    playlistName?: string | null;
    campaignName?: string | null;
    campaignId?: string | null;
    startTime: Date;
    endTime?: Date | null;
    durationSeconds?: number | null;
    timestamp?: Date;
    status: ProofOfPlayStatus;
  },
    activeDeviceNames: Set<string> = new Set(),
    activeDeviceIds: Set<string> = new Set(),
  ) {
    const assetName = log.assetName || log.content;
    const deviceIsActive =
      (log.deviceId != null && activeDeviceIds.has(log.deviceId)) ||
      activeDeviceNames.has(log.device);
    return {
      id: log.id,
      device: log.device,
      deviceId: log.deviceId ?? null,
      deviceIsActive,
      playlistName: log.playlistName ?? null,
      campaignName: log.campaignName ?? null,
      campaignId: log.campaignId ?? null,
      assetName,
      content: assetName,
      startTime: log.startTime,
      endTime: log.endTime ?? null,
      durationSeconds: log.durationSeconds ?? null,
      timestamp: log.startTime,
      status: this.toTitleStatus(log.status),
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

  private getAssetPreviewKind(asset: {
    type: AssetType;
    documentFormat?: string | null;
  }) {
    return getPreviewKind(asset.type, asset.documentFormat ?? null);
  }

  private async compactPlaylistAssetPositions(
    playlistId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const playlistAssets = sortPlaylistAssetsBySequence(
      await tx.playlistAsset.findMany({
        where: { playlistId },
        orderBy: [{ position: 'asc' }, { assetId: 'asc' }],
        select: { id: true, position: true, assetId: true },
      }),
    );

    await Promise.all(
      playlistAssets.map((playlistAsset, index) => {
        if (playlistAsset.position === index) return Promise.resolve();
        return tx.playlistAsset.update({
          where: { id: playlistAsset.id },
          data: { position: index },
        });
      }),
    );
  }

  private normalizeDurationSeconds(durationSeconds: number) {
    const normalized = Math.floor(Number(durationSeconds));
    if (!Number.isFinite(normalized) || normalized < 1) {
      throw new BadRequestException('Duration must be at least 1 second');
    }
    return normalized;
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

  private toTickerBroadcastScope(scope?: string | null) {
    const normalized = (scope ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalized === 'selected devices') return TickerBroadcastScope.SELECTED_DEVICES;
    return TickerBroadcastScope.ALL_DEVICES;
  }

  private async resolveTickerDeviceIds(
    organizationId: string,
    broadcastScope: TickerBroadcastScope,
    deviceIds?: string[],
  ) {
    if (broadcastScope === TickerBroadcastScope.ALL_DEVICES) {
      return [] as string[];
    }

    const uniqueIds = Array.from(new Set((deviceIds ?? []).filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Select at least one device for a targeted ticker broadcast');
    }

    const validDevices = await this.prisma.device.findMany({
      where: {
        organizationId,
        isPaired: true,
        id: { in: uniqueIds },
      },
      select: { id: true },
    });

    if (validDevices.length !== uniqueIds.length) {
      throw new BadRequestException('One or more selected devices are invalid for this organization');
    }

    return validDevices.map((device) => device.id);
  }

  private async countTickerReach(
    organizationId: string,
    broadcastScope: TickerBroadcastScope,
    selectedDeviceIds: string[],
  ) {
    if (broadcastScope === TickerBroadcastScope.SELECTED_DEVICES) {
      return selectedDeviceIds.length;
    }

    return this.prisma.device.count({
      where: { organizationId, isPaired: true },
    });
  }

  private toTickerPosition(position?: string | null) {
    const normalized = (position ?? '').toLowerCase();
    if (normalized === 'top') return TickerPosition.TOP;
    return TickerPosition.BOTTOM;
  }

  private clampTickerHeightPercent(heightPercent?: number | null) {
    const value = Number(heightPercent ?? 10);
    if (!Number.isFinite(value)) return 10;
    return Math.min(20, Math.max(10, Math.round(value)));
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
    backgroundColor: string;
    position: TickerPosition;
    heightPercent: number;
    broadcastScope: TickerBroadcastScope;
    status: TickerStatus;
    priority: TickerPriority;
    screens: number;
    createdAt: Date;
    updatedAt: Date;
    deviceTargets?: { device: { id: string; name: string } }[];
  }) {
    const deviceTargets = ticker.deviceTargets ?? [];
    return {
      id: ticker.id,
      text: ticker.text,
      speed: this.toTitleStatus(ticker.speed),
      style: this.toTitleStatus(ticker.style),
      color: ticker.color,
      backgroundColor: ticker.backgroundColor,
      position: this.toTitleStatus(ticker.position),
      heightPercent: this.clampTickerHeightPercent(ticker.heightPercent),
      broadcastScope: this.toTitleStatus(ticker.broadcastScope),
      status: this.toTitleStatus(ticker.status),
      priority: this.toTitleStatus(ticker.priority),
      screens: ticker.screens,
      deviceIds: deviceTargets.map((target) => target.device.id),
      deviceNames: deviceTargets.map((target) => target.device.name),
      createdAt: ticker.createdAt,
      updatedAt: ticker.updatedAt,
    };
  }

  private serializePlaylist(playlist: {
    id: string;
    name: string;
    status: PlaylistStatus;
    items: { id: string; name: string; type: string; durationSeconds: number }[];
    playlistAssets: { durationSeconds: number }[];
    screens: number;
    lastPlayedAt: Date | null;
    color: string;
    devices: { id: string; name: string }[];
  }): PlaylistDto {
    const totalSeconds = playlist.playlistAssets.reduce((sum, item) => sum + item.durationSeconds, 0);
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
      assetCount: playlist.playlistAssets.length,
      deviceIds: playlist.devices.map((device) => device.id),
      deviceNames: playlist.devices.map((device) => device.name),
    };
  }

  async listLayouts(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const layouts = await this.prisma.layout.findMany({
      where: { organizationId },
      include: this.layoutReadinessInclude(),
      orderBy: { updatedAt: 'desc' },
    });
    return layouts.map((layout) => {
      const readiness = this.computeLayoutReadiness(layout);
      return this.serializeLayout(layout, readiness);
    });
  }

  async getLayout(actor: RequestActor, layoutId: string) {
    const organizationId = this.getOrgId(actor);
    const layout = await this.prisma.layout.findFirst({
      where: { id: layoutId, organizationId },
      include: this.layoutReadinessInclude(),
    });
    if (!layout) throw new NotFoundException('Layout not found');
    const readiness = this.computeLayoutReadiness(layout);
    return this.serializeLayout(layout, readiness);
  }

  async createLayout(actor: RequestActor, body: { name: string; resolution?: string }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Layout name is required');

    const count = await this.prisma.layout.count({ where: { organizationId } });
    const resolution = this.parseLayoutResolution(body.resolution);

    const layout = await this.prisma.layout.create({
      data: {
        organizationId,
        name,
        resolution,
        status: LayoutStatus.DRAFT,
        color: colorPalette[(count + 2) % colorPalette.length],
        zones: {
          create: [
            { name: 'Center_Display', type: ZoneType.PLAYLIST, x: 0, y: 0, w: 75, h: 80, zIndex: 0, color: '#00e5ff' },
            { name: 'Bottom_Ticker', type: ZoneType.TICKER, x: 0, y: 80, w: 100, h: 20, zIndex: 1, color: '#a78bfa' },
            { name: 'Sidebar_Promo', type: ZoneType.PLAYLIST, x: 75, y: 0, w: 25, h: 80, zIndex: 2, color: '#f472b6' },
          ],
        },
      },
      include: this.layoutReadinessInclude(),
    });

    return this.serializeLayout(layout, this.computeLayoutReadiness(layout));
  }

  async updateLayout(actor: RequestActor, layoutId: string, body: { name?: string; resolution?: string; status?: string }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.layout.findFirst({ where: { id: layoutId, organizationId } });
    if (!existing) throw new NotFoundException('Layout not found');

    const data: Prisma.LayoutUpdateInput = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new BadRequestException('Layout name is required');
      data.name = name;
    }
    if (body.resolution !== undefined) data.resolution = this.parseLayoutResolution(body.resolution);
    if (body.status !== undefined) data.status = this.parseLayoutStatus(body.status);

    const layout = await this.prisma.layout.update({
      where: { id: layoutId },
      data,
      include: this.layoutReadinessInclude(),
    });

    if (body.resolution !== undefined || body.status !== undefined) {
      await this.playlistSync.bumpLayout(layoutId);
    }

    return this.serializeLayout(layout, this.computeLayoutReadiness(layout));
  }

  async saveLayoutZones(
    actor: RequestActor,
    layoutId: string,
    body: {
      zones: {
        id?: string;
        name: string;
        type: string;
        x: number;
        y: number;
        w: number;
        h: number;
        zIndex?: number;
        color?: string;
        playlistId?: string | null;
        assetId?: string | null;
      }[];
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const layout = await this.prisma.layout.findFirst({ where: { id: layoutId, organizationId } });
    if (!layout) throw new NotFoundException('Layout not found');

    const zones = body.zones ?? [];
    if (zones.length === 0) throw new BadRequestException('At least one zone is required');

    for (const zone of zones) {
      if (zone.playlistId) {
        const playlist = await this.prisma.playlist.findFirst({
          where: { id: zone.playlistId, organizationId },
        });
        if (!playlist) throw new BadRequestException(`Invalid playlist for zone "${zone.name}"`);
      }
      if (zone.assetId) {
        const asset = await this.prisma.asset.findFirst({
          where: { id: zone.assetId, organizationId },
        });
        if (!asset) throw new BadRequestException(`Invalid asset for zone "${zone.name}"`);
      }
    }

    await this.validateLayoutZoneBindings(organizationId, zones);

    await this.prisma.$transaction(async (tx) => {
      await tx.layoutZone.deleteMany({ where: { layoutId } });
      await tx.layoutZone.createMany({
        data: zones.map((zone, index) => ({
          layoutId,
          name: zone.name.trim(),
          type: this.parseZoneType(zone.type),
          x: zone.x,
          y: zone.y,
          w: zone.w,
          h: zone.h,
          zIndex: zone.zIndex ?? index,
          color: zone.color ?? '#00e5ff',
          playlistId: zone.playlistId ?? null,
          assetId: zone.assetId ?? null,
        })),
      });
      await tx.layout.update({
        where: { id: layoutId },
        data: { syncVersion: { increment: 1 } },
      });
    });

    return this.getLayout(actor, layoutId);
  }

  async deleteLayout(actor: RequestActor, layoutId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const existing = await this.prisma.layout.findFirst({ where: { id: layoutId, organizationId } });
    if (!existing) throw new NotFoundException('Layout not found');
    await this.prisma.layout.delete({ where: { id: layoutId } });
    return { success: true };
  }

  async layoutAssignmentOptions(actor: RequestActor) {
    const organizationId = this.getOrgId(actor);
    const devices = await this.prisma.device.findMany({
      where: { organizationId, isPaired: true },
      select: { id: true, name: true, location: true, status: true, currentLayoutId: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        location: device.location,
        status: this.toLowerStatus(device.status),
        currentLayoutId: device.currentLayoutId,
      })),
    };
  }

  async assignLayout(actor: RequestActor, layoutId: string, body: { deviceIds: string[] }) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const deviceIds = Array.from(new Set(body.deviceIds ?? []));

    const layout = await this.prisma.layout.findFirst({ where: { id: layoutId, organizationId } });
    if (!layout) throw new NotFoundException('Layout not found');

    if (deviceIds.length > 0) {
      const validDeviceCount = await this.prisma.device.count({
        where: { organizationId, isPaired: true, id: { in: deviceIds } },
      });
      if (validDeviceCount !== deviceIds.length) {
        throw new BadRequestException('Some devices are invalid or not paired for this organization');
      }

      const layoutWithZones = await this.prisma.layout.findFirst({
        where: { id: layoutId, organizationId },
        include: this.layoutReadinessInclude(),
      });
      if (!layoutWithZones) throw new NotFoundException('Layout not found');
      const readiness = this.computeLayoutReadiness(layoutWithZones);
      if (!readiness.isPlaybackReady) {
        throw new BadRequestException(
          `Layout is not ready for playback: ${readiness.readinessWarnings.join('; ')}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.device.updateMany({
        where: { organizationId, currentLayoutId: layoutId, id: { notIn: deviceIds } },
        data: { currentLayoutId: null },
      });

      if (deviceIds.length > 0) {
        await tx.device.updateMany({
          where: { organizationId, id: { in: deviceIds } },
          data: {
            currentLayoutId: layoutId,
            currentPlaylistId: null,
            currentContent: layout.name,
          },
        });
      }

      await tx.layout.update({
        where: { id: layoutId },
        data: {
          screens: deviceIds.length,
          syncVersion: { increment: 1 },
        },
      });
    });

    return this.getLayout(actor, layoutId);
  }

  private layoutReadinessInclude() {
    return {
      zones: {
        orderBy: { zIndex: 'asc' as const },
        include: {
          playlist: {
            include: {
              playlistAssets: {
                orderBy: { position: 'asc' as const },
                include: {
                  asset: {
                    select: { id: true, name: true, status: true, type: true, s3Key: true, url: true },
                  },
                },
              },
            },
          },
          asset: {
            select: { id: true, name: true, status: true, type: true, s3Key: true, url: true },
          },
        },
      },
      devices: { select: { id: true, name: true } },
    };
  }

  private isAssetPlaybackReady(asset: {
    status: AssetStatus;
    type: string;
    s3Key: string | null;
    url: string | null;
  }) {
    if (asset.type === AssetType.URL) {
      return !!asset.url?.trim();
    }
    return asset.status === AssetStatus.READY && !!asset.s3Key;
  }

  private computeLayoutReadiness(layout: {
    zones: {
      name: string;
      type: ZoneType;
      playlistId: string | null;
      assetId: string | null;
      playlist?: {
        name: string;
        playlistAssets?: { asset: { id: string; name: string; status: AssetStatus; type: string; s3Key: string | null; url: string | null } }[];
      } | null;
      asset?: { id: string; name: string; status: AssetStatus; type: string; s3Key: string | null; url: string | null } | null;
    }[];
  }) {
    const warnings: string[] = [];

    for (const zone of layout.zones) {
      if (zone.type === ZoneType.PLAYLIST) {
        if (!zone.playlistId || !zone.playlist) {
          warnings.push(`Zone "${zone.name}" has no playlist assigned`);
          continue;
        }
        if ((zone.playlist.playlistAssets ?? []).length === 0) {
          warnings.push(`Zone "${zone.name}" playlist "${zone.playlist.name}" has no assets`);
          continue;
        }
        for (const playlistAsset of zone.playlist.playlistAssets ?? []) {
          if (!this.isAssetPlaybackReady(playlistAsset.asset)) {
            const reason =
              playlistAsset.asset.status !== AssetStatus.READY
                ? `is ${playlistAsset.asset.status.toLowerCase()}`
                : 'has no downloadable file';
            warnings.push(`Zone "${zone.name}": asset "${playlistAsset.asset.name}" ${reason}`);
          }
        }
      }

      if (zone.type === ZoneType.IMAGE) {
        if (!zone.assetId || !zone.asset) {
          warnings.push(`Zone "${zone.name}" has no image asset assigned`);
          continue;
        }
        if (!this.isAssetPlaybackReady(zone.asset)) {
          const reason =
            zone.asset.status !== AssetStatus.READY
              ? `is ${zone.asset.status.toLowerCase()}`
              : 'has no downloadable file';
          warnings.push(`Zone "${zone.name}": asset "${zone.asset.name}" ${reason}`);
        }
      }
    }

    return {
      isPlaybackReady: warnings.length === 0,
      readinessWarnings: warnings,
    };
  }

  private async validateLayoutZoneBindings(
    organizationId: string,
    zones: { name: string; type: string; playlistId?: string | null; assetId?: string | null }[],
  ) {
    const errors: string[] = [];

    for (const zone of zones) {
      const zoneType = this.parseZoneType(zone.type);

      if (zoneType === ZoneType.IMAGE && zone.assetId) {
        const asset = await this.prisma.asset.findFirst({
          where: { id: zone.assetId, organizationId },
        });
        if (asset && !this.isAssetPlaybackReady(asset)) {
          errors.push(`Zone "${zone.name}": asset "${asset.name}" is not ready for playback`);
        }
      }

      if (zoneType === ZoneType.PLAYLIST && zone.playlistId) {
        const playlistAssets = sortPlaylistAssetsBySequence(
          await this.prisma.playlistAsset.findMany({
            where: { playlistId: zone.playlistId, playlist: { organizationId } },
            orderBy: [{ position: 'asc' }, { assetId: 'asc' }],
            include: { asset: true },
          }),
        );
        if (playlistAssets.length === 0) {
          errors.push(`Zone "${zone.name}": assigned playlist has no assets`);
        }
        for (const playlistAsset of playlistAssets) {
          if (!this.isAssetPlaybackReady(playlistAsset.asset)) {
            errors.push(
              `Zone "${zone.name}": playlist asset "${playlistAsset.asset.name}" is not ready for playback`,
            );
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }
  }

  private parseLayoutResolution(value?: string | null): LayoutResolution {
    const normalized = (value ?? '').toLowerCase();
    if (normalized.includes('4k')) return LayoutResolution.LANDSCAPE_4K;
    if (normalized.includes('portrait')) return LayoutResolution.PORTRAIT;
    return LayoutResolution.LANDSCAPE_1080P;
  }

  private parseLayoutStatus(value?: string | null): LayoutStatus {
    return (value ?? '').toLowerCase() === 'active' ? LayoutStatus.ACTIVE : LayoutStatus.DRAFT;
  }

  private parseZoneType(value?: string | null): ZoneType {
    const normalized = (value ?? '').toLowerCase();
    if (normalized === 'ticker') return ZoneType.TICKER;
    if (normalized === 'image') return ZoneType.IMAGE;
    if (normalized === 'html') return ZoneType.HTML;
    if (normalized === 'clock') return ZoneType.CLOCK;
    return ZoneType.PLAYLIST;
  }

  private serializeLayout(
    layout: {
    id: string;
    name: string;
    status: LayoutStatus;
    resolution: LayoutResolution;
    syncVersion: number;
    screens: number;
    color: string;
    createdAt: Date;
    updatedAt: Date;
    zones: {
      id: string;
      name: string;
      type: ZoneType;
      x: number;
      y: number;
      w: number;
      h: number;
      zIndex: number;
      color: string;
      playlistId: string | null;
      assetId: string | null;
      playlist?: { id: string; name: string } | null;
      asset?: { id: string; name: string } | null;
    }[];
    devices: { id: string; name: string }[];
  },
    readiness?: { isPlaybackReady: boolean; readinessWarnings: string[] },
  ) {
    return {
      id: layout.id,
      name: layout.name,
      status: this.toTitleStatus(layout.status),
      resolution: this.toTitleResolution(layout.resolution),
      syncVersion: layout.syncVersion,
      screens: layout.devices.length || layout.screens,
      color: layout.color,
      zoneCount: layout.zones.length,
      isPlaybackReady: readiness?.isPlaybackReady ?? true,
      readinessWarnings: readiness?.readinessWarnings ?? [],
      zones: layout.zones.map((zone) => this.serializeLayoutZone(zone)),
      deviceIds: layout.devices.map((device) => device.id),
      deviceNames: layout.devices.map((device) => device.name),
      createdAt: layout.createdAt,
      updatedAt: layout.updatedAt,
    };
  }

  private serializeLayoutZone(zone: {
    id: string;
    name: string;
    type: ZoneType;
    x: number;
    y: number;
    w: number;
    h: number;
    zIndex: number;
    color: string;
    playlistId: string | null;
    assetId: string | null;
    playlist?: { id: string; name: string } | null;
    asset?: { id: string; name: string } | null;
  }) {
    return {
      id: zone.id,
      name: zone.name,
      type: this.toTitleZoneType(zone.type),
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
      zIndex: zone.zIndex,
      color: zone.color,
      playlistId: zone.playlistId,
      assetId: zone.assetId,
      playlistName: zone.playlist?.name ?? null,
      assetName: zone.asset?.name ?? null,
    };
  }

  private toTitleResolution(resolution: LayoutResolution) {
    if (resolution === LayoutResolution.LANDSCAPE_4K) return 'Landscape 4K';
    if (resolution === LayoutResolution.PORTRAIT) return 'Portrait';
    return 'Landscape 1080p';
  }

  private toTitleZoneType(type: ZoneType) {
    if (type === ZoneType.TICKER) return 'Ticker';
    if (type === ZoneType.IMAGE) return 'Image';
    if (type === ZoneType.HTML) return 'Html';
    if (type === ZoneType.CLOCK) return 'Clock';
    return 'Playlist';
  }
}
