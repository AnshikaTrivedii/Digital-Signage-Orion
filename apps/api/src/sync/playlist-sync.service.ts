import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bumps playlist syncVersion whenever manifest-affecting CMS changes occur.
 * Players compare playlistVersion to skip full re-downloads when unchanged.
 */
@Injectable()
export class PlaylistSyncService {
  private readonly logger = new Logger(PlaylistSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async bumpPlaylist(playlistId: string, reason = 'cms-edit'): Promise<void> {
    const before = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { syncVersion: true, updatedAt: true },
    });
    if (!before) return;

    const deviceCount = await this.prisma.device.count({
      where: { currentPlaylistId: playlistId },
    });

    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { syncVersion: { increment: 1 } },
    });

    await this.prisma.device.updateMany({
      where: { currentPlaylistId: playlistId },
      data: { lastAckedPlaylistVersion: null },
    });

    const after = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { syncVersion: true, updatedAt: true },
    });

    this.logger.log(
      `Playlist bumped playlistId=${playlistId} reason=${reason} ` +
        `previousVersion=${before.syncVersion} newVersion=${after?.syncVersion ?? before.syncVersion + 1} ` +
        `updatedAt=${after?.updatedAt.toISOString() ?? before.updatedAt.toISOString()} ` +
        `deviceCount=${deviceCount}`,
    );

    await this.bumpLayoutsForPlaylists([playlistId]);
  }

  async bumpPlaylistsForAsset(assetId: string): Promise<void> {
    const links = await this.prisma.playlistAsset.findMany({
      where: { assetId },
      select: { playlistId: true },
    });
    if (!links.length) return;

    const playlistIds = [...new Set(links.map((link) => link.playlistId))];
    const deviceCount = await this.prisma.device.count({
      where: { currentPlaylistId: { in: playlistIds } },
    });

    const beforeVersions = await this.prisma.playlist.findMany({
      where: { id: { in: playlistIds } },
      select: { id: true, syncVersion: true },
    });

    await this.prisma.playlist.updateMany({
      where: { id: { in: playlistIds } },
      data: { syncVersion: { increment: 1 } },
    });

    await this.prisma.device.updateMany({
      where: { currentPlaylistId: { in: playlistIds } },
      data: { lastAckedPlaylistVersion: null },
    });

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
          `updatedAt=${after?.updatedAt.toISOString() ?? 'unknown'} deviceCount=${deviceCount}`,
      );
    }

    await this.bumpLayoutsForPlaylists(playlistIds);
  }

  async bumpLayout(layoutId: string, reason = 'cms-edit'): Promise<void> {
    const before = await this.prisma.layout.findUnique({
      where: { id: layoutId },
      select: { syncVersion: true, updatedAt: true },
    });
    if (!before) return;

    const deviceCount = await this.prisma.device.count({
      where: { currentLayoutId: layoutId },
    });

    await this.prisma.layout.update({
      where: { id: layoutId },
      data: { syncVersion: { increment: 1 } },
    });

    await this.prisma.device.updateMany({
      where: { currentLayoutId: layoutId },
      data: { lastAckedLayoutVersion: null },
    });

    const after = await this.prisma.layout.findUnique({
      where: { id: layoutId },
      select: { syncVersion: true, updatedAt: true },
    });

    this.logger.log(
      `Layout bumped layoutId=${layoutId} reason=${reason} ` +
        `previousVersion=${before.syncVersion} newVersion=${after?.syncVersion ?? before.syncVersion + 1} ` +
        `updatedAt=${after?.updatedAt.toISOString() ?? before.updatedAt.toISOString()} ` +
        `deviceCount=${deviceCount}`,
    );
  }

  async bumpLayoutsForPlaylists(playlistIds: string[]): Promise<void> {
    if (!playlistIds.length) return;
    const zones = await this.prisma.layoutZone.findMany({
      where: { playlistId: { in: playlistIds } },
      select: { layoutId: true },
    });
    const layoutIds = [...new Set(zones.map((zone) => zone.layoutId))];
    if (!layoutIds.length) return;

    const deviceCount = await this.prisma.device.count({
      where: { currentLayoutId: { in: layoutIds } },
    });

    const beforeVersions = await this.prisma.layout.findMany({
      where: { id: { in: layoutIds } },
      select: { id: true, syncVersion: true },
    });

    await this.prisma.layout.updateMany({
      where: { id: { in: layoutIds } },
      data: { syncVersion: { increment: 1 } },
    });

    await this.prisma.device.updateMany({
      where: { currentLayoutId: { in: layoutIds } },
      data: { lastAckedLayoutVersion: null },
    });

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
          `updatedAt=${after?.updatedAt.toISOString() ?? 'unknown'} deviceCount=${deviceCount}`,
      );
    }
  }
}
