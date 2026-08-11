/**
 * Deterministic tests for the pure schedule resolution rules.
 *
 * These run against an injected clock rather than the wall clock, so the
 * transitions the CMS depends on (scheduled -> active -> completed, handover
 * between back-to-back windows, midnight crossings, DST) are exercised exactly
 * rather than approximately.
 *
 * Usage: npx tsx scripts/test-schedule-logic.ts
 */
import {
  deriveScheduleStatus,
  findConflicts,
  nextTransitionAt,
  resolveActiveSchedule,
  windowsOverlap,
  type ScheduleWindow,
} from '../apps/api/src/scheduling/schedule-resolution';
import {
  parseCalendarDateInput,
  zonedWallTimeToUtc,
} from '../apps/api/src/common/format-datetime';

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

const TZ = 'Asia/Kolkata';

/** Build an instant from wall-clock text in a zone, the way the API does. */
function at(dateTime: string, timezone = TZ): Date {
  const [date, time] = dateTime.split(' ');
  const calendar = parseCalendarDateInput(date);
  if (!calendar) throw new Error(`bad date: ${date}`);
  const [hour, minute] = time.split(':').map(Number);
  return zonedWallTimeToUtc(calendar, hour, minute, 0, 0, timezone);
}

function schedule(
  id: string,
  start: string,
  end: string,
  options: { deviceId?: string | null; enabled?: boolean; timezone?: string } = {},
): ScheduleWindow & { playlistId: string } {
  return {
    id,
    deviceId: options.deviceId === undefined ? 'device-a' : options.deviceId,
    startDateTime: at(start, options.timezone),
    endDateTime: at(end, options.timezone),
    enabled: options.enabled ?? true,
    playlistId: `pl-${id}`,
  };
}

console.log('\n=== TEST 2 / 3 / 5: status transitions across the window ===');
{
  const morning = schedule('s1', '2026-08-12 09:00', '2026-08-12 13:00');

  check('before start -> scheduled', deriveScheduleStatus(morning, at('2026-08-12 08:59')), 'scheduled');
  check('exactly at start -> active', deriveScheduleStatus(morning, at('2026-08-12 09:00')), 'active');
  check('mid-window -> active', deriveScheduleStatus(morning, at('2026-08-12 11:30')), 'active');
  check('one minute before end -> active', deriveScheduleStatus(morning, at('2026-08-12 12:59')), 'active');
  check('exactly at end -> completed', deriveScheduleStatus(morning, at('2026-08-12 13:00')), 'completed');
  check('after end -> completed', deriveScheduleStatus(morning, at('2026-08-12 13:01')), 'completed');
}

console.log('\n=== TEST 11: disabled schedules never activate ===');
{
  const disabled = schedule('s1', '2026-08-12 09:00', '2026-08-12 13:00', { enabled: false });
  check('disabled mid-window -> disabled', deriveScheduleStatus(disabled, at('2026-08-12 11:00')), 'disabled');
  check('disabled never resolves active', resolveActiveSchedule([disabled], 'device-a', at('2026-08-12 11:00')), null);

  const reEnabled = { ...disabled, enabled: true };
  check(
    're-enabling inside the window activates it',
    resolveActiveSchedule([reEnabled], 'device-a', at('2026-08-12 11:00'))?.id ?? null,
    's1',
  );
}

console.log('\n=== TEST 4 / 6 / 7: correct playlist, handover, fallback ===');
{
  const morning = schedule('s1', '2026-08-12 09:00', '2026-08-12 13:00');
  const afternoon = schedule('s2', '2026-08-12 13:00', '2026-08-12 17:00');
  const all = [morning, afternoon];

  check('during morning -> morning playlist', resolveActiveSchedule(all, 'device-a', at('2026-08-12 10:00'))?.playlistId, 'pl-s1');
  check('at handover instant -> afternoon takes over', resolveActiveSchedule(all, 'device-a', at('2026-08-12 13:00'))?.playlistId, 'pl-s2');
  check('during afternoon -> afternoon playlist', resolveActiveSchedule(all, 'device-a', at('2026-08-12 15:00'))?.playlistId, 'pl-s2');
  check('after every window -> null (falls back to manual)', resolveActiveSchedule(all, 'device-a', at('2026-08-12 17:00')), null);
  check('before every window -> null (falls back to manual)', resolveActiveSchedule(all, 'device-a', at('2026-08-12 08:00')), null);

  check(
    'next transition from 10:00 is the 13:00 handover',
    nextTransitionAt(all, 'device-a', at('2026-08-12 10:00'))?.toISOString(),
    at('2026-08-12 13:00').toISOString(),
  );
}

console.log('\n=== TEST 8 / 9: all-devices vs device-specific targeting ===');
{
  const everywhere = schedule('all1', '2026-08-12 09:00', '2026-08-12 18:00', { deviceId: null });
  const specific = schedule('dev1', '2026-08-12 10:00', '2026-08-12 12:00', { deviceId: 'device-a' });

  check('all-devices applies to device-a', resolveActiveSchedule([everywhere], 'device-a', at('2026-08-12 11:00'))?.id, 'all1');
  check('all-devices applies to device-b', resolveActiveSchedule([everywhere], 'device-b', at('2026-08-12 11:00'))?.id, 'all1');
  check('device-specific does not leak to device-b', resolveActiveSchedule([specific], 'device-b', at('2026-08-12 11:00')), null);

  // Should never happen once conflict detection is on, but must still be ordered.
  check(
    'device-specific outranks all-devices when both somehow overlap',
    resolveActiveSchedule([everywhere, specific], 'device-a', at('2026-08-12 11:00'))?.id,
    'dev1',
  );
  check(
    'resolution is order-independent',
    resolveActiveSchedule([specific, everywhere], 'device-a', at('2026-08-12 11:00'))?.id,
    'dev1',
  );
  check(
    'device-b still gets the all-devices schedule',
    resolveActiveSchedule([everywhere, specific], 'device-b', at('2026-08-12 11:00'))?.id,
    'all1',
  );
}

console.log('\n=== TEST 10: overlap / conflict detection ===');
{
  const existing = [schedule('a', '2026-08-12 09:00', '2026-08-12 13:00')];

  const overlapping = schedule('new', '2026-08-12 12:00', '2026-08-12 15:00');
  check('12:00-15:00 conflicts with 09:00-13:00', findConflicts(overlapping, existing).map((c) => c.id), ['a']);

  const backToBack = schedule('new', '2026-08-12 13:00', '2026-08-12 15:00');
  check('13:00-15:00 does NOT conflict with 09:00-13:00', findConflicts(backToBack, existing), []);

  const contained = schedule('new', '2026-08-12 10:00', '2026-08-12 11:00');
  check('fully contained window conflicts', findConflicts(contained, existing).map((c) => c.id), ['a']);

  const enclosing = schedule('new', '2026-08-12 08:00', '2026-08-12 20:00');
  check('enclosing window conflicts', findConflicts(enclosing, existing).map((c) => c.id), ['a']);

  const otherDevice = schedule('new', '2026-08-12 10:00', '2026-08-12 11:00', { deviceId: 'device-b' });
  check('same window on a different device is fine', findConflicts(otherDevice, existing), []);

  const disabledCandidate = schedule('new', '2026-08-12 10:00', '2026-08-12 11:00', { enabled: false });
  check('a disabled candidate never conflicts', findConflicts(disabledCandidate, existing), []);

  const againstDisabled = findConflicts(contained, [{ ...existing[0], enabled: false }]);
  check('an existing disabled schedule blocks nothing', againstDisabled, []);

  // All-devices collides with everything in the org.
  const allDevicesCandidate = schedule('new', '2026-08-12 10:00', '2026-08-12 11:00', { deviceId: null });
  check('all-devices candidate conflicts with a device-specific window', findConflicts(allDevicesCandidate, existing).map((c) => c.id), ['a']);

  const specificVsAllDevices = findConflicts(schedule('new', '2026-08-12 10:00', '2026-08-12 11:00'), [
    schedule('allx', '2026-08-12 09:00', '2026-08-12 18:00', { deviceId: null }),
  ]);
  check('device-specific candidate conflicts with an all-devices window', specificVsAllDevices.map((c) => c.id), ['allx']);

  check('editing a schedule does not conflict with itself', findConflicts({ ...existing[0] }, existing), []);
}

console.log('\n=== TEST 14: midnight crossing ===');
{
  const overnight = schedule('night', '2026-08-12 22:00', '2026-08-13 06:00');

  check('22:30 on day 1 -> active', deriveScheduleStatus(overnight, at('2026-08-12 22:30')), 'active');
  check('23:59:59 -> active', deriveScheduleStatus(overnight, at('2026-08-12 23:59')), 'active');
  check('00:00 on day 2 -> still active', deriveScheduleStatus(overnight, at('2026-08-13 00:00')), 'active');
  check('03:00 on day 2 -> still active', deriveScheduleStatus(overnight, at('2026-08-13 03:00')), 'active');
  check('06:00 on day 2 -> completed', deriveScheduleStatus(overnight, at('2026-08-13 06:00')), 'completed');
  check('playlist resolves across midnight', resolveActiveSchedule([overnight], 'device-a', at('2026-08-13 02:00'))?.playlistId, 'pl-night');

  const morningAfter = schedule('morning', '2026-08-13 06:00', '2026-08-13 09:00');
  check('no conflict between overnight and the 06:00 handover', findConflicts(morningAfter, [overnight]), []);
}

console.log('\n=== TEST 15: timezone conversion ===');
{
  // 09:00 in Kolkata is 03:30 UTC; the stored instant must reflect that.
  const kolkata9am = at('2026-08-12 09:00', 'Asia/Kolkata');
  check('09:00 Asia/Kolkata stores as 03:30Z', kolkata9am.toISOString(), '2026-08-12T03:30:00.000Z');

  const utc9am = at('2026-08-12 09:00', 'UTC');
  check('09:00 UTC stores as 09:00Z', utc9am.toISOString(), '2026-08-12T09:00:00.000Z');
  check('the same wall clock in two zones is not the same instant', kolkata9am.getTime() === utc9am.getTime(), false);

  // The bug this guards: comparing a local wall clock against a UTC "now".
  const window = schedule('tz', '2026-08-12 09:00', '2026-08-12 13:00', { timezone: 'Asia/Kolkata' });
  check(
    'at 08:30 Kolkata (03:00Z) the schedule is not yet active',
    deriveScheduleStatus(window, new Date('2026-08-12T03:00:00.000Z')),
    'scheduled',
  );
  check(
    'at 09:30 Kolkata (04:00Z) the schedule is active',
    deriveScheduleStatus(window, new Date('2026-08-12T04:00:00.000Z')),
    'active',
  );
  // A naive implementation that compared the literal "09:00" against a UTC clock
  // would call this the start instant and report active. The window really ran
  // 03:30Z-07:30Z, so the correct answer is completed.
  check(
    'UTC 09:00 is past the Kolkata window, not its start',
    deriveScheduleStatus(window, new Date('2026-08-12T09:00:00.000Z')),
    'completed',
  );
  check(
    'at 13:30 Kolkata (08:00Z) the schedule is completed',
    deriveScheduleStatus(window, new Date('2026-08-12T08:00:00.000Z')),
    'completed',
  );

  // A zone with real DST, to prove the conversion is not a fixed offset.
  const winter = at('2026-01-15 09:00', 'America/New_York');
  const summer = at('2026-07-15 09:00', 'America/New_York');
  check('09:00 New York in January is 14:00Z (EST)', winter.toISOString(), '2026-01-15T14:00:00.000Z');
  check('09:00 New York in July is 13:00Z (EDT)', summer.toISOString(), '2026-07-15T13:00:00.000Z');
}

console.log('\n=== Overlap primitive (half-open intervals) ===');
{
  const a = at('2026-08-12 09:00');
  const b = at('2026-08-12 13:00');
  const c = at('2026-08-12 17:00');
  check('[09,13) vs [13,17) do not overlap', windowsOverlap(a, b, b, c), false);
  check('[09,13) vs [09,13) overlap', windowsOverlap(a, b, a, b), true);
  check('[09,17) vs [13,17) overlap', windowsOverlap(a, c, b, c), true);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Schedule logic: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
process.exit(failed === 0 ? 0 : 1);
