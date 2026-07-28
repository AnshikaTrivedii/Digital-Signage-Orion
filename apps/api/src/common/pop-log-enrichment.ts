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

/**
 * Drop accidental identical PoP rows (device retries / double flush).
 * Keeps the first occurrence; legitimate replays at different times remain.
 */
export function dedupeIdenticalPopLogs<
  T extends {
    deviceId?: string | null;
    device: string;
    assetName?: string | null;
    content?: string | null;
    playlistName?: string | null;
    campaignName?: string | null;
    startTime: Date;
    endTime?: Date | null;
    durationSeconds?: number | null;
    status: string;
  },
>(logs: T[]): T[] {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = [
      log.deviceId ?? '',
      log.device,
      log.assetName || log.content || '',
      log.playlistName ?? '',
      log.campaignName ?? '',
      log.startTime.toISOString(),
      log.endTime?.toISOString() ?? '',
      String(log.durationSeconds ?? ''),
      log.status,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const MULTIPLE_TOLERANCE = 0.15;

function resolveSinglePlaybackDuration(
  log: {
    startTime: Date;
    endTime?: Date | null;
    durationSeconds?: number | null;
  },
  slotDurationSeconds: number | null,
): { durationSeconds: number | null; endTime: Date | null } {
  let durationSeconds =
    typeof log.durationSeconds === 'number' && log.durationSeconds > 0
      ? Math.floor(log.durationSeconds)
      : null;
  let endTime = log.endTime ?? null;

  if (!durationSeconds && slotDurationSeconds) {
    durationSeconds = slotDurationSeconds;
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

  return { durationSeconds, endTime };
}

/**
 * When a single stored log covers multiple loop iterations (e.g. 60s for six
 * 10s slots), expand it into one event per configured slot duration.
 *
 * IMPORTANT: Call this only at **ingest** (player PoP submit). Reports and Excel
 * export must not re-expand — that duplicates rows already stored in the DB.
 */
export function expandPopLogPlaybackEvents<
  T extends {
    startTime: Date;
    endTime?: Date | null;
    durationSeconds?: number | null;
  },
>(log: T, slotDurationSeconds: number | null): T[] {
  const { durationSeconds, endTime } = resolveSinglePlaybackDuration(log, slotDurationSeconds);
  const normalized = { ...log, durationSeconds, endTime };

  if (!durationSeconds || !slotDurationSeconds || slotDurationSeconds < 1) {
    return [normalized];
  }

  const ratio = durationSeconds / slotDurationSeconds;
  const estimatedPlays = Math.round(ratio);
  const isCleanMultiple =
    estimatedPlays > 1 && Math.abs(ratio - estimatedPlays) <= MULTIPLE_TOLERANCE;

  if (!isCleanMultiple) {
    return [normalized];
  }

  return Array.from({ length: estimatedPlays }, (_, index) => {
    const startTime = new Date(log.startTime.getTime() + index * slotDurationSeconds * 1000);
    const eventEndTime = new Date(startTime.getTime() + slotDurationSeconds * 1000);
    return {
      ...log,
      startTime,
      endTime: eventEndTime,
      durationSeconds: slotDurationSeconds,
    };
  });
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
  const slotDurationSeconds = context?.durationSeconds ?? null;
  const { durationSeconds, endTime } = resolveSinglePlaybackDuration(log, slotDurationSeconds);

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
          orderBy: [{ position: 'asc' }, { assetId: 'asc' }],
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
