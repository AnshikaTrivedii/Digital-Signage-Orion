type PlaylistAssetRow = {
  position: number;
  assetId?: string;
  asset?: { id: string };
};

/**
 * Deterministic CMS playlist order: position ASC, then asset id.
 * Never rely on implicit database or ORM ordering.
 */
export function sortPlaylistAssetsBySequence<T extends PlaylistAssetRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    const leftId = left.assetId ?? left.asset?.id ?? '';
    const rightId = right.assetId ?? right.asset?.id ?? '';
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

/** Stable fingerprint of playlist order + per-asset durations for sync validation. */
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
