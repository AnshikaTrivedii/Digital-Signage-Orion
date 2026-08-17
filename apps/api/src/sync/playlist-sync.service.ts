import { Injectable, Logger } from '@nestjs/common';
import { DeviceCacheCommandType } from '@prisma/client';
import { DeviceCacheService } from '../device-cache/device-cache.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bumps playlist syncVersion whenever manifest-affecting CMS changes occur.
 * Players compare playlistVersion to skip full re-downloads when unchanged.
 * Also queues FORCE_SYNC so content edits (add/remove/reorder/duration) reach
 * devices the same way playlist assignment already does.
 */
@Injectable()
export class PlaylistSyncService {
  private readonly logger = new Logger(PlaylistSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceCache: DeviceCacheService,
  ) {}

  async bumpPlaylist(playlistId: string, reason = 'cms-edit'): Promise<void> {
    const before = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { syncVersion: true, updatedAt: true, organizationId: true },
    });
    if (!before) return;

    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { syncVersion: { increment: 1 } },
    });

    const affectedDeviceIds = await this.resolveDevicesAffectedByPlaylists([playlistId]);
    await this.clearPlaylistAcks(affectedDeviceIds);

    const after = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { syncVersion: true, updatedAt: true },
    });

    this.logger.log(
      `Playlist bumped playlistId=${playlistId} reason=${reason} ` +
        `previousVersion=${before.syncVersion} newVersion=${after?.syncVersion ?? before.syncVersion + 1} ` +
        `updatedAt=${after?.updatedAt.toISOString() ?? before.updatedAt.toISOString()} ` +
        `deviceCount=${affectedDeviceIds.length}`,
    );

    await this.bumpLayoutsForPlaylists([playlistId]);
    await this.notifyDevicesForceSync(before.organizationId, affectedDeviceIds);
  }

  async bumpPlaylistsForAsset(assetId: string): Promise<void> {
    const links = await this.prisma.playlistAsset.findMany({
      where: { assetId },
      select: { playlistId: true },
    });
    if (!links.length) return;

    const playlistIds = [...new Set(links.map((link) => link.playlistId))];

    const beforeVersions = await this.prisma.playlist.findMany({
      where: { id: { in: playlistIds } },
      select: { id: true, syncVersion: true, organizationId: true },
    });

    await this.prisma.playlist.updateMany({
      where: { id: { in: playlistIds } },
      data: { syncVersion: { increment: 1 } },
    });

    const affectedDeviceIds = await this.resolveDevicesAffectedByPlaylists(playlistIds);
    await this.clearPlaylistAcks(affectedDeviceIds);

    const afterVersions = await this.prisma.playlist.findMany({
      where: { id: { in: playlistIds } },
      select: { id: true, syncVersion: true, updatedAt: true },
    });
    const afterById = new Map(afterVersions.map((playlist) => [playlist.id, playlist]));

    for (const playlist of beforeVersions) {
      const after = afterById.get(playlist.id);
      this.logger.log(
        `Playlist bumped playlistId=${playlist.id} reason=asset-updated assetId=${assetId} ` +
          `previousVersion=${playlist.syncVersion} newVersion=${after?.syncVersion ?? playlist.syncVersion + 1} ` +
          `updatedAt=${after?.updatedAt.toISOString() ?? 'unknown'} deviceCount=${affectedDeviceIds.length}`,
      );
    }

    await this.bumpLayoutsForPlaylists(playlistIds);

    const organizationIds = [...new Set(beforeVersions.map((playlist) => playlist.organizationId))];
    for (const organizationId of organizationIds) {
      await this.notifyDevicesForceSync(organizationId, affectedDeviceIds);
    }
  }

  async bumpLayout(layoutId: string, reason = 'cms-edit'): Promise<void> {
    const before = await this.prisma.layout.findUnique({
      where: { id: layoutId },
      select: { syncVersion: true, updatedAt: true, organizationId: true },
    });
    if (!before) return;

    await this.prisma.layout.update({
      where: { id: layoutId },
      data: { syncVersion: { increment: 1 } },
    });

    const affectedDeviceIds = await this.resolveDevicesAffectedByLayouts([layoutId]);
    await this.clearLayoutAcks(affectedDeviceIds);

    const after = await this.prisma.layout.findUnique({
      where: { id: layoutId },
      select: { syncVersion: true, updatedAt: true },
    });

    this.logger.log(
      `Layout bumped layoutId=${layoutId} reason=${reason} ` +
        `previousVersion=${before.syncVersion} newVersion=${after?.syncVersion ?? before.syncVersion + 1} ` +
        `updatedAt=${after?.updatedAt.toISOString() ?? before.updatedAt.toISOString()} ` +
        `deviceCount=${affectedDeviceIds.length}`,
    );

    await this.notifyDevicesForceSync(before.organizationId, affectedDeviceIds);
  }

  async bumpLayoutsForPlaylists(playlistIds: string[]): Promise<void> {
    if (!playlistIds.length) return;
    const zones = await this.prisma.layoutZone.findMany({
      where: { playlistId: { in: playlistIds } },
      select: { layoutId: true },
    });
    const layoutIds = [...new Set(zones.map((zone) => zone.layoutId))];
    if (!layoutIds.length) return;

    const beforeVersions = await this.prisma.layout.findMany({
      where: { id: { in: layoutIds } },
      select: { id: true, syncVersion: true },
    });

    await this.prisma.layout.updateMany({
      where: { id: { in: layoutIds } },
      data: { syncVersion: { increment: 1 } },
    });

    const affectedDeviceIds = await this.resolveDevicesAffectedByLayouts(layoutIds);
    await this.clearLayoutAcks(affectedDeviceIds);

    const afterVersions = await this.prisma.layout.findMany({
      where: { id: { in: layoutIds } },
      select: { id: true, syncVersion: true, updatedAt: true },
    });
    const afterById = new Map(afterVersions.map((layout) => [layout.id, layout]));

    for (const layout of beforeVersions) {
      const after = afterById.get(layout.id);
      this.logger.log(
        `Layout bumped layoutId=${layout.id} reason=playlist-changed ` +
          `previousVersion=${layout.syncVersion} newVersion=${after?.syncVersion ?? layout.syncVersion + 1} ` +
          `updatedAt=${after?.updatedAt.toISOString() ?? 'unknown'} deviceCount=${affectedDeviceIds.length}`,
      );
    }

    // Parent bumpPlaylist / bumpPlaylistsForAsset already FORCE_SYNCs layout
    // devices via resolveDevicesAffectedByPlaylists. Do not queue again here.
  }

  /**
   * Devices that would play these playlists: manual assignment, layout zones,
   * and enabled schedules (device-specific or org-wide).
   */
  private async resolveDevicesAffectedByPlaylists(playlistIds: string[]): Promise<string[]> {
    if (!playlistIds.length) return [];

    const [assigned, layoutZones, schedules] = await Promise.all([
      this.prisma.device.findMany({
        where: { currentPlaylistId: { in: playlistIds }, isPaired: true },
        select: { id: true },
      }),
      this.prisma.layoutZone.findMany({
        where: { playlistId: { in: playlistIds } },
        select: { layoutId: true },
      }),
      this.prisma.schedule.findMany({
        where: { playlistId: { in: playlistIds }, enabled: true },
        select: { deviceId: true, organizationId: true },
      }),
    ]);

    const deviceIds = new Set<string>(assigned.map((device) => device.id));

    const layoutIds = [...new Set(layoutZones.map((zone) => zone.layoutId))];
    if (layoutIds.length) {
      const layoutDevices = await this.prisma.device.findMany({
        where: { currentLayoutId: { in: layoutIds }, isPaired: true },
        select: { id: true },
      });
      for (const device of layoutDevices) {
        deviceIds.add(device.id);
      }
    }

    const orgWideOrgIds = [
      ...new Set(
        schedules.filter((schedule) => schedule.deviceId == null).map((schedule) => schedule.organizationId),
      ),
    ];
    for (const schedule of schedules) {
      if (schedule.deviceId) deviceIds.add(schedule.deviceId);
    }
    if (orgWideOrgIds.length) {
      const orgDevices = await this.prisma.device.findMany({
        where: { organizationId: { in: orgWideOrgIds }, isPaired: true },
        select: { id: true },
      });
      for (const device of orgDevices) {
        deviceIds.add(device.id);
      }
    }

    return [...deviceIds];
  }

  private async resolveDevicesAffectedByLayouts(layoutIds: string[]): Promise<string[]> {
    if (!layoutIds.length) return [];
    const devices = await this.prisma.device.findMany({
      where: { currentLayoutId: { in: layoutIds }, isPaired: true },
      select: { id: true },
    });
    return devices.map((device) => device.id);
  }

  private async clearPlaylistAcks(deviceIds: string[]): Promise<void> {
    if (!deviceIds.length) return;
    await this.prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { lastAckedPlaylistVersion: null },
    });
  }

  private async clearLayoutAcks(deviceIds: string[]): Promise<void> {
    if (!deviceIds.length) return;
    await this.prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { lastAckedLayoutVersion: null },
    });
  }

  private async notifyDevicesForceSync(organizationId: string, deviceIds: string[]): Promise<void> {
    const unique = [...new Set(deviceIds)];
    if (!unique.length) return;

    const targets = await this.prisma.device.findMany({
      where: { id: { in: unique }, organizationId, isPaired: true },
      select: { id: true },
    });
    if (!targets.length) return;

    await Promise.all(
      targets.map((device) =>
        this.deviceCache
          .queueCommand(device.id, organizationId, DeviceCacheCommandType.FORCE_SYNC)
          .catch(() => undefined),
      ),
    );

    this.logger.log(
      `FORCE_SYNC queued reason=playlist-or-layout-bump organizationId=${organizationId} deviceCount=${targets.length}`,
    );
  }
}
