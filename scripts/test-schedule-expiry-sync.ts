/**
 * Proves schedule expiry flips syncRequired / activeSchedule without depending
 * on the Android player. Uses an injected clock against the pure resolution
 * helpers + the same half-open DB filter the API uses.
 *
 * Usage: npx tsx scripts/test-schedule-expiry-sync.ts
 */
import {
  deriveScheduleStatus,
  nextTransitionAt,
  resolveActiveSchedule,
  type ScheduleWindow,
} from '../apps/api/src/scheduling/schedule-resolution';
import {
  parseCalendarDateInput,
  zonedWallTimeToUtc,
} from '../apps/api/src/common/format-datetime';

const TZ = 'Asia/Kolkata';
let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`),
  );
}

function at(dateTime: string): Date {
  const [date, time] = dateTime.split(' ');
  const calendar = parseCalendarDateInput(date);
  if (!calendar) throw new Error(`bad date: ${date}`);
  const [hour, minute] = time.split(':').map(Number);
  return zonedWallTimeToUtc(calendar, hour, minute, 0, 0, TZ);
}

/** Mirror of Prisma filter: start <= now AND end > now */
function apiActiveFilter(schedules: ScheduleWindow[], now: Date): ScheduleWindow[] {
  return schedules.filter(
    (s) =>
      s.enabled &&
      s.startDateTime.getTime() <= now.getTime() &&
      s.endDateTime.getTime() > now.getTime(),
  );
}

function simulateSyncRequired(args: {
  lastAckedScheduleId: string | null;
  lastAckedPlaylistId: string | null;
  activeScheduleId: string | null;
  effectivePlaylistId: string | null;
}): boolean {
  if ((args.lastAckedScheduleId ?? null) !== (args.activeScheduleId ?? null)) return true;
  if (!args.effectivePlaylistId) {
    return args.lastAckedPlaylistId != null || args.lastAckedScheduleId != null;
  }
  if (args.lastAckedPlaylistId !== args.effectivePlaylistId) return true;
  return false;
}

console.log('\n=== Schedule end at 12:50 Asia/Kolkata (user report scenario) ===');
{
  const start = at('2026-08-13 12:40');
  const end = at('2026-08-13 12:50');
  const schedule: ScheduleWindow = {
    id: 'sched-1250',
    deviceId: null,
    startDateTime: start,
    endDateTime: end,
    enabled: true,
  };

  console.log(`scheduleStart=${start.toISOString()}`);
  console.log(`scheduleEnd  =${end.toISOString()}`);

  const tBefore = at('2026-08-13 12:39');
  const tActive = at('2026-08-13 12:45');
  const tEnd = at('2026-08-13 12:50');
  const tAfter = at('2026-08-13 12:51');

  check('T-1 status scheduled', deriveScheduleStatus(schedule, tBefore), 'scheduled');
  check('T+mid status active', deriveScheduleStatus(schedule, tActive), 'active');
  check('T=end status completed', deriveScheduleStatus(schedule, tEnd), 'completed');
  check('T+1 status completed', deriveScheduleStatus(schedule, tAfter), 'completed');

  check('API filter mid includes schedule', apiActiveFilter([schedule], tActive).map((s) => s.id), [
    'sched-1250',
  ]);
  check('API filter at end excludes schedule', apiActiveFilter([schedule], tEnd), []);
  check('resolve mid = schedule', resolveActiveSchedule([schedule], 'device-a', tActive)?.id ?? null, 'sched-1250');
  check('resolve at end = null', resolveActiveSchedule([schedule], 'device-a', tEnd), null);

  check(
    'nextTransition during window = end',
    nextTransitionAt([schedule], 'device-a', tActive)?.toISOString() ?? null,
    end.toISOString(),
  );

  // Device was on the scheduled playlist; after end, fallback manual playlist differs.
  check(
    'syncRequired after end (playlist changed)',
    simulateSyncRequired({
      lastAckedScheduleId: 'sched-1250',
      lastAckedPlaylistId: 'pl-scheduled',
      activeScheduleId: null,
      effectivePlaylistId: 'pl-manual',
    }),
    true,
  );

  // Same playlist as manual — old bug: syncRequired stayed false.
  check(
    'syncRequired after end (same playlist id)',
    simulateSyncRequired({
      lastAckedScheduleId: 'sched-1250',
      lastAckedPlaylistId: 'pl-same',
      activeScheduleId: null,
      effectivePlaylistId: 'pl-same',
    }),
    true,
  );

  check(
    'syncRequired after end (no fallback)',
    simulateSyncRequired({
      lastAckedScheduleId: 'sched-1250',
      lastAckedPlaylistId: 'pl-scheduled',
      activeScheduleId: null,
      effectivePlaylistId: null,
    }),
    true,
  );

  check(
    'syncRequired stable mid-window',
    simulateSyncRequired({
      lastAckedScheduleId: 'sched-1250',
      lastAckedPlaylistId: 'pl-scheduled',
      activeScheduleId: 'sched-1250',
      effectivePlaylistId: 'pl-scheduled',
    }),
    false,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
