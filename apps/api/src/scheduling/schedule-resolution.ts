/**
 * Pure schedule logic — no Prisma, no Nest, no clock of its own.
 *
 * Everything here operates on absolute instants. Wall-clock/timezone conversion
 * happens at the API edge (see schedule.service.ts), so by the time a schedule
 * reaches this file its window is already UTC and comparisons are UTC-to-UTC.
 */

export type ScheduleStatus = 'scheduled' | 'active' | 'completed' | 'disabled';

/** Minimal shape needed to reason about a schedule. */
export type ScheduleWindow = {
  id: string;
  /** null = targets every device in the organization. */
  deviceId: string | null;
  startDateTime: Date;
  endDateTime: Date;
  enabled: boolean;
};

/**
 * Status is derived, never stored, so it cannot go stale between writes.
 *
 * disabled  → enabled === false (regardless of the clock)
 * scheduled → now < start
 * active    → start <= now < end
 * completed → now >= end
 */
export function deriveScheduleStatus(schedule: ScheduleWindow, now: Date): ScheduleStatus {
  if (!schedule.enabled) return 'disabled';
  const at = now.getTime();
  if (at < schedule.startDateTime.getTime()) return 'scheduled';
  if (at < schedule.endDateTime.getTime()) return 'active';
  return 'completed';
}

/**
 * Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd).
 *
 * Half-open is what makes back-to-back schedules legal — 09:00–13:00 followed by
 * 13:00–15:00 do not conflict, and at exactly 13:00 only the second is active.
 */
export function windowsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Whether two schedules can ever target the same screen at the same moment.
 *
 * An all-devices schedule (deviceId === null) covers every device, so it collides
 * with any other schedule in the organization — including device-specific ones.
 */
export function targetsCollide(a: Pick<ScheduleWindow, 'deviceId'>, b: Pick<ScheduleWindow, 'deviceId'>): boolean {
  if (a.deviceId === null || b.deviceId === null) return true;
  return a.deviceId === b.deviceId;
}

/** Schedules that would double-book a screen with `candidate`. */
export function findConflicts<T extends ScheduleWindow>(
  candidate: Omit<ScheduleWindow, 'id'> & { id?: string },
  existing: T[],
): T[] {
  // A disabled candidate can never be active, so it cannot double-book anything.
  if (!candidate.enabled) return [];

  return existing.filter(
    (other) =>
      other.id !== candidate.id &&
      other.enabled &&
      targetsCollide(candidate, other) &&
      windowsOverlap(
        candidate.startDateTime,
        candidate.endDateTime,
        other.startDateTime,
        other.endDateTime,
      ),
  );
}

/** Schedules applying to `deviceId` that are active at `now`. */
export function activeSchedulesFor<T extends ScheduleWindow>(
  schedules: T[],
  deviceId: string,
  now: Date,
): T[] {
  return schedules.filter(
    (schedule) =>
      (schedule.deviceId === null || schedule.deviceId === deviceId) &&
      deriveScheduleStatus(schedule, now) === 'active',
  );
}

/**
 * Pick the winning schedule for a device. Never random.
 *
 * Conflict detection normally prevents overlaps, but rows predating a rule change
 * or written concurrently could still overlap, so the tie-break is fully ordered:
 *   1. device-specific beats all-devices (the more specific intent wins)
 *   2. later start wins (the most recently begun window is the current intent)
 *   3. lower id wins (arbitrary but stable, so every replica agrees)
 */
export function resolveActiveSchedule<T extends ScheduleWindow>(
  schedules: T[],
  deviceId: string,
  now: Date,
): T | null {
  const candidates = activeSchedulesFor(schedules, deviceId, now);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => (comparePrecedence(current, best) < 0 ? current : best));
}

/** Negative when `a` outranks `b`. */
function comparePrecedence(a: ScheduleWindow, b: ScheduleWindow): number {
  const aSpecific = a.deviceId !== null ? 0 : 1;
  const bSpecific = b.deviceId !== null ? 0 : 1;
  if (aSpecific !== bSpecific) return aSpecific - bSpecific;

  const startDelta = b.startDateTime.getTime() - a.startDateTime.getTime();
  if (startDelta !== 0) return startDelta;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Next instant at which this device's resolution could change, or null if nothing
 * is pending. Used to tell the player how long the current answer stays valid.
 */
export function nextTransitionAt<T extends ScheduleWindow>(
  schedules: T[],
  deviceId: string,
  now: Date,
): Date | null {
  const at = now.getTime();
  const boundaries: number[] = [];

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    if (schedule.deviceId !== null && schedule.deviceId !== deviceId) continue;
    if (schedule.startDateTime.getTime() > at) boundaries.push(schedule.startDateTime.getTime());
    if (schedule.endDateTime.getTime() > at) boundaries.push(schedule.endDateTime.getTime());
  }

  if (boundaries.length === 0) return null;
  return new Date(Math.min(...boundaries));
}
