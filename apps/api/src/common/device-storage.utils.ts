/** PostgreSQL/Prisma Int max — used when clamping non-storage integer fields. */
export const PRISMA_INT_MAX = 2_147_483_647;

/**
 * Normalize device-reported storage bytes for BigInt persistence.
 * Accepts large values from Android (e.g. 64 GB+) that exceed Int32.
 */
export function normalizeStorageBytes(value: unknown): bigint {
  if (value === undefined || value === null) return BigInt(0);
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return BigInt(0);
  return BigInt(Math.floor(numeric));
}

/** Convert stored BigInt/number storage bytes for JSON API responses and UI formatting. */
export function storageBytesToNumber(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

/** Clamp optional integer telemetry to Prisma Int column range. */
export function clampPrismaInt(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(PRISMA_INT_MAX, Math.max(0, Math.floor(numeric)));
}
