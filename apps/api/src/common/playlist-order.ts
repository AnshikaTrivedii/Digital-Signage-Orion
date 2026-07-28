type PlaylistAssetRow = {
  id?: string;
  position: number;
  assetId?: string;
  asset?: { id: string };
};

/**
 * Deterministic CMS playlist order: position ASC, then playlist-asset row id.
 * Never rely on implicit database or ORM ordering.
 * Tie-break on PlaylistAsset.id (not assetId) so duplicate assets stay stable.
 */
export function sortPlaylistAssetsBySequence<T extends PlaylistAssetRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    const leftId = left.id ?? left.assetId ?? left.asset?.id ?? '';
    const rightId = right.id ?? right.assetId ?? right.asset?.id ?? '';
    return leftId.localeCompare(rightId);
  });
}

export function formatPlaylistOrderLog(
  entries: { id: string; position: number; durationSeconds: number; name: string }[],
): string {
  return entries
    .map((entry) => `${entry.position}:${entry.id}:${entry.durationSeconds}s:${entry.name}`)
    .join(' → ');
}

/** Stable fingerprint of playlist order + per-slot durations for sync validation. */
export function buildManifestSequenceSignature(
  entries: { id: string; position: number; durationSeconds: number }[],
): string {
  return entries.map((entry) => `${entry.position}:${entry.id}:${entry.durationSeconds}`).join('|');
}

export function isSequentialManifest(
  entries: { position: number }[],
): boolean {
  return entries.every((entry, index) => entry.position === index);
}
