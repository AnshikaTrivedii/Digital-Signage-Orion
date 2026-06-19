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

  async bumpPlaylistsForCampaign(campaignId: string): Promise<void> {
    const links = await this.prisma.playlistCampaign.findMany({
      where: { campaignId },
      select: { playlistId: true },
    });
    if (!links.length) return;

    await this.prisma.playlist.updateMany({
      where: { id: { in: links.map((link) => link.playlistId) } },
      data: { syncVersion: { increment: 1 } },
    });
  }

  async bumpPlaylistsForAsset(assetId: string): Promise<void> {
    const campaignLinks = await this.prisma.campaignAsset.findMany({
      where: { assetId },
      select: { campaignId: true },
    });
    const campaignIds = [...new Set(campaignLinks.map((link) => link.campaignId))];
    await Promise.all(campaignIds.map((campaignId) => this.bumpPlaylistsForCampaign(campaignId)));
  }
}
