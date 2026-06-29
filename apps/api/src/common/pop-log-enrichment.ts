import type { PrismaService } from '../prisma/prisma.service';

export type PopLogPlaybackContext = {
  playlistName: string | null;
  campaignName: string | null;
  campaignId: string | null;
  durationSeconds: number | null;
};

type PlaylistWithAssets = {
  id: string;
  name: string;
  playlistAssets: {
    durationSeconds: number;
    asset: { name: string };
  }[];
};

export function normalizeAssetName(name: string): string {
  return name.trim().toLowerCase();
}

export function enrichPopLogFields(
  log: {
    assetName: string;
    playlistName?: string | null;
    campaignName?: string | null;
    startTime: Date;
    endTime?: Date | null;
    durationSeconds?: number | null;
  },
  context?: PopLogPlaybackContext,
) {
  const playlistName = log.playlistName?.trim() || context?.playlistName || null;
  const campaignName = log.campaignName?.trim() || context?.campaignName || null;
  const campaignId = context?.campaignId ?? null;

  let durationSeconds =
    typeof log.durationSeconds === 'number' && log.durationSeconds > 0
      ? Math.floor(log.durationSeconds)
      : null;
  let endTime = log.endTime ?? null;

  if (!durationSeconds && context?.durationSeconds) {
    durationSeconds = context.durationSeconds;
  }
  if (!endTime && durationSeconds) {
    endTime = new Date(log.startTime.getTime() + durationSeconds * 1000);
  }
  if (!durationSeconds && endTime) {
    durationSeconds = Math.max(
      1,
      Math.round((endTime.getTime() - log.startTime.getTime()) / 1000),
    );
  }

  return { playlistName, campaignName, campaignId, endTime, durationSeconds };
}

export class PopLogContextIndex {
  private readonly byPlaylistId = new Map<string, Map<string, PopLogPlaybackContext>>();
  private readonly fallbackByAsset = new Map<string, PopLogPlaybackContext>();
  private readonly folderByAsset = new Map<string, { id: string; name: string }>();

  constructor(private readonly prisma: PrismaService) {}

  private async loadPlaylists(organizationId: string) {
    return this.prisma.playlist.findMany({
      where: { organizationId },
      include: {
        playlistAssets: {
          orderBy: { position: 'asc' },
          include: { asset: true },
        },
      },
    });
  }

  private campaignContextForAsset(assetName: string): Pick<PopLogPlaybackContext, 'campaignName' | 'campaignId'> {
    const folder = this.folderByAsset.get(normalizeAssetName(assetName));
    return {
      campaignName: folder?.name ?? null,
      campaignId: folder?.id ?? null,
    };
  }

  private indexPlaylist(playlist: PlaylistWithAssets) {
    const assetMap = new Map<string, PopLogPlaybackContext>();
    for (const playlistAsset of playlist.playlistAssets) {
      const key = normalizeAssetName(playlistAsset.asset.name);
      const entry: PopLogPlaybackContext = {
        playlistName: playlist.name,
        ...this.campaignContextForAsset(playlistAsset.asset.name),
        durationSeconds: playlistAsset.durationSeconds,
      };
      assetMap.set(key, entry);
      if (!this.fallbackByAsset.has(key)) {
        this.fallbackByAsset.set(key, entry);
      }
    }
    this.byPlaylistId.set(playlist.id, assetMap);
  }

  async load(organizationId: string) {
    const [playlists, assets] = await Promise.all([
      this.loadPlaylists(organizationId),
      this.prisma.asset.findMany({
        where: { organizationId },
        select: { name: true, folder: { select: { id: true, name: true } } },
      }),
    ]);

    for (const asset of assets) {
      if (asset.folder) {
        this.folderByAsset.set(normalizeAssetName(asset.name), asset.folder);
      }
    }

    for (const playlist of playlists) {
      this.indexPlaylist(playlist);
    }
    return this;
  }

  resolve(assetName: string, preferredPlaylistId?: string | null): PopLogPlaybackContext | undefined {
    const key = normalizeAssetName(assetName);
    if (preferredPlaylistId) {
      const preferred = this.byPlaylistId.get(preferredPlaylistId)?.get(key);
      if (preferred) return preferred;
    }
    return this.fallbackByAsset.get(key);
  }
}
