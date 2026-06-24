import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bumps playlist syncVersion whenever manifest-affecting CMS changes occur.
 * Players compare playlistVersion to skip full re-downloads when unchanged.
 */
@Injectable()
export class PlaylistSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async bumpPlaylist(playlistId: string): Promise<void> {
    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { syncVersion: { increment: 1 } },
    });
  }

  async bumpPlaylistsForAsset(assetId: string): Promise<void> {
    const links = await this.prisma.playlistAsset.findMany({
      where: { assetId },
      select: { playlistId: true },
    });
    if (!links.length) return;

    const playlistIds = [...new Set(links.map((link) => link.playlistId))];
    await this.prisma.playlist.updateMany({
      where: { id: { in: playlistIds } },
      data: { syncVersion: { increment: 1 } },
    });
  }
}
