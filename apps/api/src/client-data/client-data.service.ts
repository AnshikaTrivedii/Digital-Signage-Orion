import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
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
import { enrichPopLogFields, PopLogContextIndex } from '../common/pop-log-enrichment';
import { sortPlaylistAssetsBySequence } from '../common/playlist-order';
import {
  EXCEL_REPORT_DATETIME_NUM_FMT,
  addCalendarDays,
  compareCalendarDates,
  endOfZonedDay,
  getZonedCalendarDate,
  parseCalendarDateInput,
  startOfZonedDay,
  toExcelWallClockDate,
} from '../common/format-datetime';
import { storageBytesToNumber } from '../common/device-storage.utils';
import { getPreviewKind } from '../assets/asset-media.utils';
import { DeviceCacheService } from '../device-cache/device-cache.service';
import { DeviceManagementService, resolveInitialSyncState } from '../device-management/device-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { PlaylistSyncService } from '../sync/playlist-sync.service';

const colorPalette = ['#4ade80', '#00e5ff', '#a78bfa', '#f472b6', '#fb923c', '#60a5fa'];

/** Columns every proof-of-play surface reads. */
const POP_LOG_SCAN_SELECT = {
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
} satisfies Prisma.ProofOfPlayLogSelect;

/**
 * Total order. `startTime` alone leaves rows flushed in the same second in an
 * arbitrary order, which silently dropped and repeated rows across pages.
 */
const POP_LOG_SCAN_ORDER: Prisma.ProofOfPlayLogOrderByWithRelationInput[] = [
  { startTime: 'desc' },
  { id: 'desc' },
];

const POP_LOG_SCAN_BATCH = 5_000;

type PopLogScanRow = Prisma.ProofOfPlayLogGetPayload<{ select: typeof POP_LOG_SCAN_SELECT }>;

type ReportChartBucket = {
  startMs: number;
  endMs: number;
  label: string;
  impressions: number;
  verified: number;
};

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
        active: event.status === ScheduleStatus.ACTIVE,
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
        // Preserve NULL — never coerce blank playlist duration to a type default.
        durationSeconds: pa.durationSeconds ?? null,
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

  async addPlaylistAsset(
    actor: RequestActor,
    playlistId: string,
    assetId: string,
    durationSeconds?: number | null,
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const playlist = await this.prisma.playlist.findFirst({ where: { id: playlistId, organizationId } });
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, organizationId } });
    if (!playlist || !asset) throw new NotFoundException('Playlist or Asset not found');
    if (asset.status !== AssetStatus.READY) {
      throw new BadRequestException('Only ready assets can be added to a playlist');
    }

    // Same asset may be added multiple times — each call creates a new PlaylistAsset row.
    // Blank/omitted duration MUST be SQL NULL (no playlist override). Never default to 10.
    const normalizedDuration =
      durationSeconds === undefined || durationSeconds === null
        ? null
        : this.normalizeDurationSeconds(durationSeconds);

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

    return {
      success: true,
      playlistAssetId: pa.id,
      // Explicit null in JSON (not omitted) so the CMS never falls back to asset defaults.
      durationSeconds: pa.durationSeconds ?? null,
    };
  }

  async updatePlaylistAssetDuration(
    actor: RequestActor,
    playlistId: string,
    playlistAssetId: string,
    durationSeconds: number | null,
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const normalizedDuration =
      durationSeconds === null ? null : this.normalizeDurationSeconds(durationSeconds);

    const playlistAsset = await this.prisma.playlistAsset.findFirst({
      where: { id: playlistAssetId, playlistId, playlist: { organizationId } },
      include: { playlist: true, asset: true },
    });

    if (!playlistAsset) {
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
      `Playlist asset duration updated playlistId=${playlistId} playlistAssetId=${playlistAssetId} ` +
        `assetId=${updated.assetId} previousDuration=${previousDuration ?? 'null'}s ` +
        `newDuration=${updated.durationSeconds ?? 'null'}s position=${updated.position}`,
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

  async removePlaylistAsset(actor: RequestActor, playlistId: string, playlistAssetId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const pa = await this.prisma.playlistAsset.findFirst({
      where: { id: playlistAssetId, playlistId, playlist: { organizationId } },
      include: { playlist: true },
    });

    if (!pa) {
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

  async reorderPlaylistAssets(
    actor: RequestActor,
    playlistId: string,
    body: { playlistAssetIds: string[] },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const playlist = await this.prisma.playlist.findFirst({ where: { id: playlistId, organizationId } });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const existingAssets = await this.prisma.playlistAsset.findMany({
      where: { playlistId },
      select: { id: true },
    });
    const existingIds = new Set(existingAssets.map((entry) => entry.id));

    if (body.playlistAssetIds.length !== existingIds.size) {
      throw new BadRequestException('playlistAssetIds must include every playlist item exactly once');
    }

    const seen = new Set<string>();
    for (const playlistAssetId of body.playlistAssetIds) {
      if (!existingIds.has(playlistAssetId)) {
        throw new BadRequestException('Invalid playlist asset id in reorder payload');
      }
      if (seen.has(playlistAssetId)) {
        throw new BadRequestException('playlistAssetIds must not contain duplicates');
      }
      seen.add(playlistAssetId);
    }

    await this.prisma.$transaction(
      body.playlistAssetIds.map((playlistAssetId, index) =>
        this.prisma.playlistAsset.update({
          where: { id: playlistAssetId },
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

    await this.notifyDevicesSyncRequired(organizationId, deviceIds, actor.userId);

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
        color: this.sanitizeHexColor(body.color, colorPalette[count % colorPalette.length]),
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

  /**
   * Soft-remove a paired device from the CMS without destroying history.
   *
   * Revokes the device token (player returns to pairing on next API call),
   * clears playlist/layout assignment and local cache metadata, and detaches
   * the device from the organization. Proof-of-play rows keep their `deviceId`
   * so reports remain auditable. The Android player regenerates a pairing code
   * on its next `init-pairing` call.
   */
  async unregisterDevice(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId, isPaired: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.deviceCacheCommand.deleteMany({ where: { deviceId } });
      await tx.deviceCachedAsset.deleteMany({ where: { deviceId } });
      await tx.tickerDevice.deleteMany({ where: { deviceId } });

      await tx.device.update({
        where: { id: deviceId },
        data: {
          isPaired: false,
          organizationId: null,
          // Keep deviceToken so the next heartbeat/sync returns deviceStatus=UNREGISTERED.
          // init-pairing regenerates a pairing code and clears the token.
          pairingCode: null,
          pairingSecret: null,
          currentPlaylistId: null,
          currentLayoutId: null,
          lastAckedPlaylistVersion: null,
          lastAckedLayoutVersion: null,
          pendingInitialSync: false,
          initialSyncRequestedAt: null,
          status: DeviceStatus.OFFLINE,
          currentContent: null,
          currentAsset: null,
          currentPlaylistName: null,
          playbackStatus: 'STOPPED',
          cachePlaylistName: null,
          cachePlaylistVersion: null,
          cacheLayoutName: null,
          cacheLayoutVersion: null,
          cacheTotalBytes: 0,
          cacheUsedBytes: 0,
          cachedAssetCount: 0,
          expectedAssetCount: 0,
          pendingDownloadCount: 0,
          cacheLastReportedAt: null,
          lastSuccessfulSyncAt: null,
          lastFailedSyncAt: null,
          lastSyncError: null,
          syncReportStatus: null,
          lastSync: 'Unregistered',
          uptime: '0s',
          configVersion: { increment: 1 },
        },
      });
    });

    this.logger.log(
      `Device unregistered id=${deviceId} name=${device.name} org=${organizationId} by=${actor.userId}`,
    );

    return {
      success: true,
      unregistered: true,
      deviceStatus: 'UNREGISTERED' as const,
      deviceId: device.id,
      deviceName: device.name,
      // PoP history is intentionally retained (deviceId still points at this row).
      proofOfPlayPreserved: true,
    };
  }

  /**
   * Permanently remove a device from the CMS.
   *
   * Cascades remove ticker targets, cache rows, cache commands and system logs.
   * Proof-of-play history is preserved: `ProofOfPlayLog.deviceId` is set to NULL
   * (`onDelete: SetNull`) while the denormalized device name remains for reports.
   * A deleted player that reconnects must call `init-pairing` again (new draft).
   */
  async deleteDevice(actor: RequestActor, deviceId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId },
    });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.$transaction(async (tx) => {
      // Explicit cleanup so no orphan mappings remain even if a relation's
      // onDelete policy changes later. PoP logs are left alone (SetNull).
      await tx.deviceCacheCommand.deleteMany({ where: { deviceId } });
      await tx.deviceCachedAsset.deleteMany({ where: { deviceId } });
      await tx.tickerDevice.deleteMany({ where: { deviceId } });
      await tx.deviceSystemLog.deleteMany({ where: { deviceId } });

      await tx.device.delete({ where: { id: deviceId } });
    });

    this.logger.log(
      `Device deleted id=${deviceId} name=${device.name} org=${organizationId} by=${actor.userId}`,
    );

    return {
      success: true,
      deleted: true,
      deviceStatus: 'DELETED' as const,
      deviceId: device.id,
      deviceName: device.name,
      proofOfPlayPreserved: true,
    };
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

  async updateDeviceDisplaySettings(
    actor: RequestActor,
    deviceId: string,
    body: {
      orientation?: string;
      stretchToFit?: boolean;
      defaultImageDuration?: number;
      defaultVideoDuration?: number;
      defaultDocumentDuration?: number;
      defaultUrlDuration?: number;
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const updated = await this.deviceManagement.updateDeviceDisplaySettings(
      deviceId,
      organizationId,
      body,
    );
    return this.serializeDevice(updated);
  }

  async getDevicePlaybackSettings(actor: RequestActor, deviceId: string) {
    const organizationId = this.getOrgId(actor);
    const device = await this.deviceManagement.findDevice(deviceId, organizationId);
    return this.deviceManagement.getDevicePlaybackSettings(device);
  }

  async updateDevicePlaybackSettings(
    actor: RequestActor,
    deviceId: string,
    body: {
      imageDuration?: number;
      videoDuration?: number;
      documentDuration?: number;
      urlDuration?: number;
    },
  ) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    if (
      body.imageDuration === undefined
      && body.videoDuration === undefined
      && body.documentDuration === undefined
      && body.urlDuration === undefined
    ) {
      throw new BadRequestException('Provide at least one playback duration to update');
    }
    return this.deviceManagement.updateDevicePlaybackSettings(deviceId, organizationId, body);
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

  /**
   * Notify assigned devices that CMS content changed. Queues FORCE_SYNC for every
   * paired device with active content, and marks never-synced devices for initial
   * onboarding so the player does not wait for the normal polling interval.
   */
  private async notifyDevicesSyncRequired(
    organizationId: string,
    deviceIds: string[],
    requestedById?: string,
  ) {
    if (!deviceIds.length) return;

    const targets = await this.prisma.device.findMany({
      where: {
        id: { in: deviceIds },
        organizationId,
        isPaired: true,
        OR: [{ currentPlaylistId: { not: null } }, { currentLayoutId: { not: null } }],
      },
      select: { id: true, lastSuccessfulSyncAt: true },
    });

    if (!targets.length) return;

    const freshIds = targets
      .filter((device) => device.lastSuccessfulSyncAt == null)
      .map((device) => device.id);

    if (freshIds.length) {
      await this.prisma.device.updateMany({
        where: { id: { in: freshIds } },
        data: { pendingInitialSync: true, initialSyncRequestedAt: new Date() },
      });
    }

    await Promise.all(
      targets.map((device) =>
        this.deviceCache
          .queueCommand(device.id, organizationId, DeviceCacheCommandType.FORCE_SYNC, requestedById)
          .catch(() => undefined),
      ),
    );
  }

  private async notifyTickerDevicesSyncRequired(
    organizationId: string,
    broadcastScope: TickerBroadcastScope,
    selectedDeviceIds: string[],
    requestedById?: string,
  ) {
    let deviceIds: string[];
    if (broadcastScope === TickerBroadcastScope.ALL_DEVICES) {
      const devices = await this.prisma.device.findMany({
        where: { organizationId, isPaired: true },
        select: { id: true },
      });
      deviceIds = devices.map((device) => device.id);
    } else {
      deviceIds = selectedDeviceIds;
    }

    await this.notifyDevicesSyncRequired(organizationId, deviceIds, requestedById);
  }

  /** @deprecated Use notifyDevicesSyncRequired */
  private async triggerInitialSync(
    organizationId: string,
    deviceIds: string[],
    requestedById?: string,
  ) {
    await this.notifyDevicesSyncRequired(organizationId, deviceIds, requestedById);
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

    if (paired.currentPlaylistId || paired.currentLayoutId) {
      await this.notifyDevicesSyncRequired(organizationId, [paired.id], actor.userId);
    }

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
    stretchToFit?: boolean;
    defaultImageDuration?: number;
    defaultVideoDuration?: number;
    defaultDocumentDuration?: number;
    defaultUrlDuration?: number;
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
    pendingInitialSync?: boolean;
    initialSyncRequestedAt?: Date | null;
    currentPlaylist?: { name: string } | null;
    currentLayout?: { name: string } | null;
  }) {
    const effectiveStatus = this.deviceManagement.resolveEffectiveStatus({
      lastSeenAt: device.lastSeenAt ?? null,
      status: device.status,
    } as import('@prisma/client').Device);
    const initialSyncState = resolveInitialSyncState({
      pendingInitialSync: device.pendingInitialSync,
      initialSyncRequestedAt: device.initialSyncRequestedAt ?? null,
    });
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
      orientation: this.deviceManagement.normalizeOrientation(device.orientation),
      stretchToFit: Boolean(device.stretchToFit),
      defaultImageDuration: device.defaultImageDuration ?? 10,
      defaultVideoDuration: device.defaultVideoDuration ?? 10,
      defaultDocumentDuration: device.defaultDocumentDuration ?? 20,
      defaultUrlDuration: device.defaultUrlDuration ?? 20,
      timezone: device.timezone ?? 'UTC',
      networkStatus: device.networkStatus ?? 'UNKNOWN',
      wifiSignalStrength: device.wifiSignalStrength ?? 0,
      currentAsset: device.currentAsset ?? device.currentContent ?? '—',
      currentPlaylist: device.currentPlaylistName ?? device.currentPlaylist?.name ?? device.currentLayout?.name ?? '—',
      assignedPlaylist: device.currentPlaylist?.name ?? device.currentLayout?.name ?? null,
      playbackStatus: device.playbackStatus ?? 'UNKNOWN',
      playbackUptimeSeconds: device.playbackUptimeSeconds ?? 0,
      initialSyncState,
      pendingInitialSync: initialSyncState === 'pending',
      initialSyncRequestedAt: device.initialSyncRequestedAt?.toISOString() ?? null,
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

    if (ticker.status === TickerStatus.ACTIVE) {
      await this.notifyTickerDevicesSyncRequired(
        organizationId,
        broadcastScope,
        selectedDeviceIds,
        actor.userId,
      );
    }

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

    if (updated.status === TickerStatus.ACTIVE) {
      await this.notifyTickerDevicesSyncRequired(
        organizationId,
        updated.broadcastScope,
        updated.deviceTargets.map((target) => target.deviceId),
        actor.userId,
      );
    }

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

    await this.notifyTickerDevicesSyncRequired(
      organizationId,
      updated.broadcastScope,
      updated.deviceTargets.map((target) => target.deviceId),
      actor.userId,
    );

    return this.serializeTicker(updated);
  }

  async deleteTicker(actor: RequestActor, tickerId: string) {
    this.assertCanEdit(actor);
    const organizationId = this.getOrgId(actor);
    const ticker = await this.prisma.ticker.findFirst({
      where: { id: tickerId, organizationId },
      include: { deviceTargets: { select: { deviceId: true } } },
    });
    if (!ticker) throw new NotFoundException('Ticker not found');

    await this.prisma.ticker.delete({ where: { id: tickerId } });

    await this.notifyTickerDevicesSyncRequired(
      organizationId,
      ticker.broadcastScope,
      ticker.deviceTargets.map((target) => target.deviceId),
      actor.userId,
    );

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
      timezone?: string;
    } = {},
  ) {
    const organizationId = this.getOrgId(actor);
    const range = query.range ?? 'today';
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(500, Math.max(1, query.limit ?? 100));
    const { where, whereIgnoringDate, rangeStart, rangeEnd } = await this.buildPopLogWhere(
      organizationId,
      query,
    );

    const verifiedWhere: Prisma.ProofOfPlayLogWhereInput = {
      ...where,
      status: ProofOfPlayStatus.VERIFIED,
    };
    const failedWhere: Prisma.ProofOfPlayLogWhereInput = {
      ...where,
      status: ProofOfPlayStatus.FAILED,
    };

    const [
      devices,
      campaigns,
      organization,
      totalLogs,
      verifiedCount,
      failedCount,
      logs,
      latestLog,
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
      this.prisma.proofOfPlayLog.findMany({
        where,
        select: POP_LOG_SCAN_SELECT,
        // (startTime, id) is a total order, so page N never overlaps or skips
        // page N+1 even when a whole batch shares the same startTime.
        orderBy: POP_LOG_SCAN_ORDER,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.proofOfPlayLog.findFirst({
        where: { organizationId },
        orderBy: POP_LOG_SCAN_ORDER,
        select: { startTime: true, device: true },
      }),
    ]);

    // "Last log" is org-wide, so it can legitimately point at a row the selected
    // range cannot contain (different filters, or a playback timestamp ahead of
    // the window because a device clock is skewed). Measure that explicitly so
    // the UI can explain the gap instead of looking broken.
    const [logsAheadOfRange, logsBehindRange, latestMatchingLog] = await Promise.all([
      rangeEnd
        ? this.prisma.proofOfPlayLog.count({
            where: { AND: [whereIgnoringDate, { startTime: { gt: rangeEnd } }] },
          })
        : Promise.resolve(0),
      rangeStart
        ? this.prisma.proofOfPlayLog.count({
            where: { AND: [whereIgnoringDate, { startTime: { lt: rangeStart } }] },
          })
        : Promise.resolve(0),
      this.prisma.proofOfPlayLog.findFirst({
        where: whereIgnoringDate,
        orderBy: POP_LOG_SCAN_ORDER,
        select: { startTime: true, device: true },
      }),
    ]);

    const contextIndex = await new PopLogContextIndex(this.prisma).load(organizationId);
    const devicePlaylistById = new Map(devices.map((device) => [device.id, device.currentPlaylistId]));
    const enrich = (log: PopLogScanRow) => {
      const assetName = log.assetName || log.content;
      const playbackContext = contextIndex.resolve(
        assetName,
        log.deviceId ? devicePlaylistById.get(log.deviceId) : null,
      );
      // Enrichment only fills in display fields (playlist, campaign, derived
      // duration). It never adds, removes or merges rows: one stored playback
      // event is always exactly one report row and one Excel row.
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
      return { ...log, ...enriched, assetName };
    };

    const enrichedLogs = logs.map(enrich);
    const buckets = this.buildReportChartBuckets(range, rangeStart, rangeEnd, query.timezone);
    const deviceById = new Map(devices.map((device) => [device.id, device]));
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
    const campaignAgg = new Map<string, {
      id: string | null;
      name: string;
      impressions: number;
      verified: number;
    }>();
    const contentAgg = new Map<string, { content: string; impressions: number; verified: number }>();
    let durationTotal = 0;
    let durationSamples = 0;
    let scannedLogs = 0;

    // Single full pass over every row matching the filter — same `where` as the
    // count above and as the export, so all three can never disagree.
    for await (const batch of this.scanPopLogs(where)) {
      for (const raw of batch) {
        const log = enrich(raw);
        scannedLogs += 1;
        const isVerified = log.status === ProofOfPlayStatus.VERIFIED;

        const bucket = this.findChartBucket(buckets, log.startTime);
        if (bucket) {
          bucket.impressions += 1;
          if (isVerified) bucket.verified += 1;
        }

        if (isVerified && log.durationSeconds && log.durationSeconds > 0) {
          durationTotal += log.durationSeconds;
          durationSamples += 1;
        }

        const matched = log.deviceId ? deviceById.get(log.deviceId) : deviceByName.get(log.device);
        const deviceKey = matched?.id ?? log.device;
        const deviceEntry = deviceAgg.get(deviceKey) ?? {
          id: matched?.id ?? null,
          name: log.device,
          location: matched?.location ?? 'Unknown',
          status: matched?.status ?? null,
          impressions: 0,
          verified: 0,
          lastPlay: null as Date | null,
        };
        deviceEntry.impressions += 1;
        if (isVerified) deviceEntry.verified += 1;
        if (!deviceEntry.lastPlay || log.startTime > deviceEntry.lastPlay) {
          deviceEntry.lastPlay = log.startTime;
        }
        deviceAgg.set(deviceKey, deviceEntry);

        const campaignKey = log.campaignId ?? `name:${log.campaignName ?? '__uncategorized__'}`;
        const campaignEntry = campaignAgg.get(campaignKey) ?? {
          id: log.campaignId ?? null,
          name: log.campaignName ?? 'Uncategorized',
          impressions: 0,
          verified: 0,
        };
        campaignEntry.impressions += 1;
        if (isVerified) campaignEntry.verified += 1;
        campaignAgg.set(campaignKey, campaignEntry);

        const contentEntry = contentAgg.get(log.assetName) ?? {
          content: log.assetName,
          impressions: 0,
          verified: 0,
        };
        contentEntry.impressions += 1;
        if (isVerified) contentEntry.verified += 1;
        contentAgg.set(log.assetName, contentEntry);
      }
    }

    if (scannedLogs !== totalLogs) {
      this.logger.warn(
        `PoP report scan mismatch org=${organizationId} range=${range} counted=${totalLogs} scanned=${scannedLogs}`,
      );
    }

    const chartData = buckets.map((bucket) => ({
      day: bucket.label,
      impressions: bucket.impressions,
      engagement:
        bucket.impressions > 0 ? Math.round((bucket.verified / bucket.impressions) * 100) : 0,
    }));

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

    // Averaged over the same durations that are shown in the table and written
    // to Excel, including the ones derived from the playlist slot.
    const avgEngagement = durationSamples > 0 ? Math.round(durationTotal / durationSamples) : 0;

    const deviceNameSet = new Set(devices.map((device) => device.name));
    const deviceIdSet = new Set(devices.map((device) => device.id));
    // Device options come from the date range alone: picking a device must not
    // remove the other devices from the picker.
    const { where: rangeOnlyWhere } = await this.buildPopLogWhere(organizationId, {
      range: query.range,
      startDate: query.startDate,
      endDate: query.endDate,
      timezone: query.timezone,
    });
    const reportingDevices = await this.prisma.proofOfPlayLog.groupBy({
      by: ['device', 'deviceId'],
      where: rangeOnlyWhere,
    });
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
        billedImpressions: totalLogs,
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
        // Straight COUNT(*) over the same predicate the table and the export use.
        total: totalLogs,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalLogs / limit)),
        distinctDevicesInRange: deviceAgg.size,
      },
      lastLogAt: latestLog?.startTime ?? null,
      lastLogDevice: latestLog?.device ?? null,
      // Reconciles "Last log says today" against an empty table.
      rangeDiagnostics: {
        logsAheadOfRange,
        logsBehindRange,
        latestMatchingLogAt: latestMatchingLog?.startTime ?? null,
        latestMatchingLogDevice: latestMatchingLog?.device ?? null,
      },
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
    // Exactly the predicate the dashboard uses — the export never re-filters,
    // re-sorts or de-duplicates on top of it, so CMS count === Excel row count.
    const { where } = await this.buildPopLogWhere(organizationId, query);

    const [expectedRows, devices] = await Promise.all([
      this.prisma.proofOfPlayLog.count({ where }),
      this.prisma.device.findMany({
        where: { organizationId },
        select: { id: true, name: true, currentPlaylistId: true },
      }),
    ]);

    this.logger.log(
      `PoP export org=${organizationId} range=${query.range ?? 'today'} ` +
        `deviceId=${query.deviceId ?? 'all'} folderId=${query.folderId ?? 'all'} ` +
        `status=${query.status ?? 'all'} search=${query.search?.trim() ? 'yes' : 'no'} ` +
        `timezone=${exportTimeZone} expectedRows=${expectedRows}`,
    );

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
    ];
    sheet.getRow(1).font = { bold: true };

    let writtenRows = 0;
    // Keyset paging, not LIMIT/OFFSET: every matching row is written, however
    // many there are, and rows cannot be skipped by inserts arriving mid-export.
    for await (const batch of this.scanPopLogs(where)) {
      for (const log of batch) {
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
        const row = sheet.addRow({
          device: log.device,
          playlistName: enriched.playlistName ?? '',
          assetName,
          startTime: toExcelWallClockDate(log.startTime, exportTimeZone),
          endTime: toExcelWallClockDate(enriched.endTime, exportTimeZone),
          duration: enriched.durationSeconds != null ? `${enriched.durationSeconds}s` : '',
        });
        // Real Date cells + 24h format so Excel sorts chronologically, not as text.
        row.getCell('startTime').numFmt = EXCEL_REPORT_DATETIME_NUM_FMT;
        row.getCell('endTime').numFmt = EXCEL_REPORT_DATETIME_NUM_FMT;
        writtenRows += 1;
      }
    }

    if (writtenRows < expectedRows) {
      this.logger.error(
        `PoP export incomplete org=${organizationId} expected=${expectedRows} written=${writtenRows}`,
      );
      throw new InternalServerErrorException(
        'Export aborted: fewer rows were read than the report contains. Please retry.',
      );
    }

    this.logger.log(`PoP export finished org=${organizationId} rows=${writtenRows}`);

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
      timezone?: string;
    },
  ) {
    const { rangeStart, rangeEnd } = this.resolveReportDateRange(
      query.range ?? 'today',
      query.startDate,
      query.endDate,
      query.timezone,
    );
    const andClauses: Prisma.ProofOfPlayLogWhereInput[] = [{ organizationId }];

    // Kept by reference so the date clause can be subtracted below, letting
    // callers ask "what matches these filters *outside* the window?".
    let dateClause: Prisma.ProofOfPlayLogWhereInput | null = null;
    if (rangeStart || rangeEnd) {
      dateClause = {
        startTime: {
          ...(rangeStart ? { gte: rangeStart } : {}),
          ...(rangeEnd ? { lte: rangeEnd } : {}),
        },
      };
      andClauses.push(dateClause);
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
        // Match by stable deviceId, or by device name for legacy rows that predate deviceId.
        // Never match other devices' rows (even if names were later changed).
        andClauses.push({
          OR: [
            { deviceId: device.id },
            {
              AND: [
                { OR: [{ deviceId: null }, { deviceId: '' }] },
                { device: { equals: device.name, mode: 'insensitive' } },
              ],
            },
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

    return {
      where: { AND: andClauses },
      whereIgnoringDate: {
        AND: andClauses.filter((clause) => clause !== dateClause),
      } satisfies Prisma.ProofOfPlayLogWhereInput,
      rangeStart,
      rangeEnd,
    };
  }

  /**
   * Resolve inclusive playback window bounds in UTC from calendar days in `timezone`.
   * Filtering uses ProofOfPlayLog.startTime (playback start).
   */
  private resolveReportDateRange(
    range: string,
    startDate?: string,
    endDate?: string,
    timezone?: string,
  ) {
    const timeZone = timezone?.trim() || 'UTC';
    const normalized = (range ?? 'today').toLowerCase();
    const now = new Date();
    const today = getZonedCalendarDate(now, timeZone);

    if (normalized === 'custom') {
      if (!startDate?.trim() || !endDate?.trim()) {
        throw new BadRequestException('Custom range requires startDate and endDate');
      }
      const customStart = parseCalendarDateInput(startDate);
      const customEnd = parseCalendarDateInput(endDate);
      if (!customStart) throw new BadRequestException('Invalid startDate');
      if (!customEnd) throw new BadRequestException('Invalid endDate');
      if (compareCalendarDates(customEnd, customStart) < 0) {
        throw new BadRequestException('endDate must be on or after startDate');
      }
      return {
        rangeStart: startOfZonedDay(customStart, timeZone),
        rangeEnd: endOfZonedDay(customEnd, timeZone),
      };
    }

    if (normalized === 'today') {
      return {
        rangeStart: startOfZonedDay(today, timeZone),
        rangeEnd: endOfZonedDay(today, timeZone),
      };
    }

    if (normalized === 'yesterday') {
      const yesterday = addCalendarDays(today, -1);
      return {
        rangeStart: startOfZonedDay(yesterday, timeZone),
        rangeEnd: endOfZonedDay(yesterday, timeZone),
      };
    }

    // Inclusive rolling windows that include today:
    // Last 7 days  → today + previous 6 calendar days
    // Last 15 days → today + previous 14 calendar days
    const inclusiveDays = normalized === '15d' ? 15 : 7;
    const rangeStartDay = addCalendarDays(today, -(inclusiveDays - 1));
    return {
      rangeStart: startOfZonedDay(rangeStartDay, timeZone),
      rangeEnd: endOfZonedDay(today, timeZone),
    };
  }

  /**
   * Read every log matching `where` in stable order, in bounded batches.
   *
   * Keyset (cursor) paging rather than LIMIT/OFFSET: the window never shifts
   * when rows are inserted while the scan is running, so no row is skipped or
   * read twice, and there is no upper bound on how many rows can be read.
   */
  private async *scanPopLogs(
    where: Prisma.ProofOfPlayLogWhereInput,
  ): AsyncGenerator<PopLogScanRow[]> {
    let cursor: { id: string } | undefined;

    for (;;) {
      const batch = await this.prisma.proofOfPlayLog.findMany({
        where,
        select: POP_LOG_SCAN_SELECT,
        orderBy: POP_LOG_SCAN_ORDER,
        take: POP_LOG_SCAN_BATCH,
        ...(cursor ? { cursor, skip: 1 } : {}),
      });

      if (!batch.length) return;
      yield batch;
      if (batch.length < POP_LOG_SCAN_BATCH) return;
      cursor = { id: batch[batch.length - 1].id };
    }
  }

  /**
   * Chart buckets covering exactly the filtered window, aligned to calendar
   * hours/days in the viewer's timezone so a bar never straddles two local days
   * (including across daylight-saving changes).
   */
  private buildReportChartBuckets(
    range: string,
    rangeStart: Date | null,
    rangeEnd: Date | null,
    timezone?: string,
  ): ReportChartBucket[] {
    const timeZone = timezone?.trim() || 'UTC';
    const normalized = (range ?? 'today').toLowerCase();
    const end = rangeEnd ?? new Date();
    const start = rangeStart ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (end.getTime() <= start.getTime()) return [];

    const hourly = normalized === 'today' || normalized === 'yesterday';
    const boundaries: number[] = [];

    if (hourly) {
      for (let ms = start.getTime(); ms < end.getTime(); ms += 60 * 60 * 1000) {
        boundaries.push(ms);
      }
    } else {
      const firstDay = getZonedCalendarDate(start, timeZone);
      const dayCount = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
      );
      // Long custom ranges are grouped into equal multi-day bars so the chart
      // stays readable; the bars still tile the window exactly.
      const step = Math.max(1, Math.ceil(dayCount / 31));
      for (let day = 0; day < dayCount; day += step) {
        boundaries.push(startOfZonedDay(addCalendarDays(firstDay, day), timeZone).getTime());
      }
    }

    if (!boundaries.length) boundaries.push(start.getTime());

    return boundaries.map((startMs, index) => {
      const endMs = index + 1 < boundaries.length ? boundaries[index + 1] : end.getTime() + 1;
      const bucketStart = new Date(startMs);
      return {
        startMs,
        endMs,
        label: hourly
          ? bucketStart.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone })
          : boundaries.length <= 7
            ? bucketStart.toLocaleDateString('en-US', { weekday: 'short', timeZone })
            : bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone }),
        impressions: 0,
        verified: 0,
      };
    });
  }

  private findChartBucket(buckets: ReportChartBucket[], at: Date): ReportChartBucket | null {
    const ms = at.getTime();
    let low = 0;
    let high = buckets.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (ms < buckets[mid].startMs) high = mid - 1;
      else if (ms >= buckets[mid].endMs) low = mid + 1;
      else return buckets[mid];
    }
    return null;
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
    playlistAssets: { durationSeconds: number | null }[];
    screens: number;
    lastPlayedAt: Date | null;
    color: string;
    devices: { id: string; name: string }[];
  }): PlaylistDto {
    const totalSeconds = playlist.playlistAssets.reduce(
      (sum, item) => sum + (item.durationSeconds ?? 0),
      0,
    );
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
            lastAckedPlaylistVersion: null,
            lastAckedLayoutVersion: null,
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

    await this.notifyDevicesSyncRequired(organizationId, deviceIds, actor.userId);

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
