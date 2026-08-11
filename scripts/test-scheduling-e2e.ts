/**
 * End-to-end scheduling tests against a running API, real Postgres rows and the
 * real player sync endpoints.
 *
 * Covers the integration half of the matrix: CRUD through HTTP, conflict
 * rejection, the priority rule (active schedule > manual playlist > nothing),
 * what the player actually receives, and fallback after a schedule ends or is
 * deleted. Pure clock/timezone rules live in test-schedule-logic.ts.
 *
 * Windows that must flip during the run are written straight to the database so
 * they can be second-precise; everything user-facing goes through the API.
 *
 * Usage: npx tsx scripts/test-scheduling-e2e.ts
 */
import { PrismaClient } from '@prisma/client';

const API = process.env.VERIFY_API_URL ?? 'http://localhost:3001/api';
const EMAIL = process.env.VERIFY_EMAIL ?? 'orgadmin@acme.com';
const PASSWORD = process.env.VERIFY_PASSWORD ?? 'orgadmin123';

const prisma = new PrismaClient();
const RUN = `sched-e2e-${Date.now()}`;

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

function checkTruthy(label: string, actual: unknown) {
  const ok = Boolean(actual);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  actual=${JSON.stringify(actual)}`}`);
}

let token = '';
let orgId = '';

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Same as api() but returns the status instead of throwing, for negative tests. */
async function apiRaw(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

/** Player-authenticated call, using the device token rather than a user JWT. */
async function playerApi<T>(deviceToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

type ScheduleResponse = {
  id: string;
  name: string;
  playlistId: string;
  playlistName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  allDevices: boolean;
  startDateTime: string;
  endDateTime: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  enabled: boolean;
  status: 'scheduled' | 'active' | 'completed' | 'disabled';
};

type SyncRevision = {
  contentType: string;
  playlistId: string | null;
  layoutId: string | null;
  contentSource: string;
  activeSchedule: {
    scheduleId: string;
    scheduleName: string;
    playlistId: string;
    startDateTime: string;
    endDateTime: string;
  } | null;
  revision: string;
  syncRequired: boolean;
};

/** Wall-clock parts in the org timezone, offset by whole minutes from now. */
function wallClock(offsetMinutes: number, timezone: string) {
  const instant = new Date(Date.now() + offsetMinutes * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23',
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}`,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // ---------------------------------------------------------------- setup
  const login = await api<{ accessToken?: string; token?: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  token = login.accessToken ?? login.token ?? '';
  if (!token) throw new Error('login returned no token');

  const membership = await prisma.organizationMembership.findFirst({
    where: { user: { email: EMAIL }, status: 'ACTIVE' },
  });
  orgId = membership?.organizationId ?? '';
  if (!orgId) throw new Error('could not resolve organizationId');

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  const timezone = organization?.timezone ?? 'Asia/Kolkata';
  console.log(`\nOrganization timezone: ${timezone}\n`);

  // Two playlists and two paired devices, all disposable.
  const playlistA = await prisma.playlist.create({
    data: { organizationId: orgId, name: `${RUN}-playlist-A` },
  });
  const playlistB = await prisma.playlist.create({
    data: { organizationId: orgId, name: `${RUN}-playlist-B` },
  });
  const manualPlaylist = await prisma.playlist.create({
    data: { organizationId: orgId, name: `${RUN}-playlist-MANUAL` },
  });

  const deviceA = await prisma.device.create({
    data: {
      organizationId: orgId,
      name: `${RUN}-device-A`,
      hardwareId: `${RUN}-hw-A`,
      deviceToken: `${RUN}-token-A`,
      isPaired: true,
      // The manual assignment the device must fall back to.
      currentPlaylistId: manualPlaylist.id,
    },
  });
  const deviceB = await prisma.device.create({
    data: {
      organizationId: orgId,
      name: `${RUN}-device-B`,
      hardwareId: `${RUN}-hw-B`,
      deviceToken: `${RUN}-token-B`,
      isPaired: true,
    },
  });

  const created: string[] = [];
  const createSchedule = async (body: Record<string, unknown>) => {
    const schedule = await api<ScheduleResponse>('/client-data/schedules', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    created.push(schedule.id);
    return schedule;
  };

  try {
    // ============================================================ TEST 1 & 2
    console.log('=== TEST 1/2: create a future schedule, verify it is Scheduled ===');
    const futureStart = wallClock(60, timezone);
    const futureEnd = wallClock(180, timezone);
    const future = await createSchedule({
      name: `${RUN} future`,
      playlistId: playlistA.id,
      deviceId: deviceA.id,
      startDate: futureStart.date,
      startTime: futureStart.time,
      endDate: futureEnd.date,
      endTime: futureEnd.time,
      enabled: true,
    });
    check('status is scheduled', future.status, 'scheduled');
    check('playlist reference resolved by name', future.playlistName, playlistA.name);
    check('device reference resolved by name', future.deviceName, deviceA.name);
    check('allDevices flag false for a device-specific schedule', future.allDevices, false);
    check('wall-clock start echoed back unchanged', `${future.startDate} ${future.startTime}`, `${futureStart.date} ${futureStart.time}`);
    check('response reports the org timezone', future.timezone, timezone);

    const futureRow = await prisma.schedule.findUnique({ where: { id: future.id } });
    check('DB stores playlistId as a reference', futureRow?.playlistId, playlistA.id);
    check('DB stores an absolute instant', futureRow?.startDateTime.toISOString(), future.startDateTime);
    checkTruthy('DB does not copy playlist contents (no such column)', !('assets' in (futureRow ?? {})));

    // ================================================================ TEST 18
    console.log('\n=== TEST 18a: a future schedule does not disturb the manual playlist ===');
    let revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('device still plays its manually assigned playlist', revision.playlistId, manualPlaylist.id);
    check('content source is the manual assignment', revision.contentSource, 'manual-playlist');
    check('activeSchedule is null when nothing is active', revision.activeSchedule, null);

    // ============================================================== TEST 3/4
    console.log('\n=== TEST 3/4: a schedule inside its window is Active and wins ===');
    const activeStart = wallClock(-60, timezone);
    const activeEnd = wallClock(60, timezone);
    const active = await createSchedule({
      name: `${RUN} active`,
      playlistId: playlistA.id,
      deviceId: deviceA.id,
      startDate: activeStart.date,
      startTime: activeStart.time,
      endDate: activeEnd.date,
      endTime: activeEnd.time,
      enabled: true,
    });
    check('status is active', active.status, 'active');

    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('sync returns the scheduled playlist, not the manual one', revision.playlistId, playlistA.id);
    check('content source is the schedule', revision.contentSource, 'schedule');
    check('activeSchedule.scheduleId matches', revision.activeSchedule?.scheduleId, active.id);
    check('activeSchedule.playlistId matches', revision.activeSchedule?.playlistId, playlistA.id);
    check('activeSchedule carries the window', revision.activeSchedule?.startDateTime, active.startDateTime);
    check('contentType is playlist', revision.contentType, 'playlist');
    checkTruthy('revision string encodes the active schedule', revision.revision.includes(active.id));

    const syncPayload = await playerApi<{ playlist: { id: string } | null; activeSchedule: unknown }>(
      deviceA.deviceToken!,
      '/player/sync',
    );
    check('full sync serves the scheduled playlist manifest', syncPayload.playlist?.id, playlistA.id);
    checkTruthy('full sync includes activeSchedule', syncPayload.activeSchedule);

    // ================================================================ TEST 10
    console.log('\n=== TEST 10: overlapping schedules are rejected ===');
    const overlapStart = wallClock(0, timezone);
    const overlapEnd = wallClock(120, timezone);
    const conflict = await apiRaw('/client-data/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name: `${RUN} overlapping`,
        playlistId: playlistB.id,
        deviceId: deviceA.id,
        startDate: overlapStart.date,
        startTime: overlapStart.time,
        endDate: overlapEnd.date,
        endTime: overlapEnd.time,
        enabled: true,
      }),
    });
    check('overlapping create is rejected with 409', conflict.status, 409);
    check('error is labelled Schedule Conflict', conflict.body.error, 'Schedule Conflict');
    checkTruthy(
      'message names the problem',
      String(conflict.body.message ?? '').includes('already has a schedule during this period'),
    );
    checkTruthy('conflicting schedule is identified', Array.isArray(conflict.body.conflicts) && (conflict.body.conflicts as unknown[]).length > 0);

    const afterConflict = await prisma.schedule.findUnique({ where: { id: active.id } });
    check('the existing schedule was not overwritten', afterConflict?.playlistId, playlistA.id);

    console.log('\n=== TEST 10b: an All Devices schedule also collides ===');
    const allDevicesConflict = await apiRaw('/client-data/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name: `${RUN} all-devices overlap`,
        playlistId: playlistB.id,
        deviceId: null,
        startDate: overlapStart.date,
        startTime: overlapStart.time,
        endDate: overlapEnd.date,
        endTime: overlapEnd.time,
        enabled: true,
      }),
    });
    check('all-devices create conflicts with a device-specific window', allDevicesConflict.status, 409);

    console.log('\n=== TEST 10c: back-to-back windows are allowed ===');
    // The future schedule from TEST 1 ends at +180, so starting exactly at +180
    // must be legal — touching endpoints are not an overlap.
    const nextStart = wallClock(180, timezone);
    const nextEnd = wallClock(240, timezone);
    const backToBack = await apiRaw('/client-data/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name: `${RUN} back-to-back`,
        playlistId: playlistB.id,
        deviceId: deviceA.id,
        startDate: nextStart.date,
        startTime: nextStart.time,
        endDate: nextEnd.date,
        endTime: nextEnd.time,
        enabled: true,
      }),
    });
    check('back-to-back window is accepted', backToBack.status, 201);
    if (backToBack.status === 201) created.push((backToBack.body as { id: string }).id);

    console.log('\n=== Validation: end must be after start ===');
    const inverted = await apiRaw('/client-data/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name: `${RUN} inverted`,
        playlistId: playlistA.id,
        deviceId: deviceB.id,
        startDate: futureEnd.date,
        startTime: futureEnd.time,
        endDate: futureStart.date,
        endTime: futureStart.time,
      }),
    });
    check('inverted window rejected with 400', inverted.status, 400);

    // ================================================================ TEST 11
    console.log('\n=== TEST 11: disabling a schedule releases the device ===');
    const disabled = await api<ScheduleResponse>(`/client-data/schedules/${active.id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
    check('status becomes disabled', disabled.status, 'disabled');
    check('enabled flag is false', disabled.enabled, false);

    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('a disabled schedule never drives the player', revision.activeSchedule, null);
    check('device falls back to its manual playlist', revision.playlistId, manualPlaylist.id);
    check('content source is back to manual', revision.contentSource, 'manual-playlist');

    console.log('\n=== TEST 11b: re-enabling inside the window reactivates it ===');
    const reEnabled = await api<ScheduleResponse>(`/client-data/schedules/${active.id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    });
    check('status returns to active', reEnabled.status, 'active');
    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('player picks the schedule up again', revision.activeSchedule?.scheduleId, active.id);

    // ================================================================ TEST 13
    console.log('\n=== TEST 13: editing an active schedule reaches the next sync ===');
    const edited = await api<ScheduleResponse>(`/client-data/schedules/${active.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: `${RUN} active renamed`, playlistId: playlistB.id }),
    });
    check('name updated', edited.name, `${RUN} active renamed`);
    check('playlist swapped', edited.playlistId, playlistB.id);
    check('still active after the edit', edited.status, 'active');

    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('next sync serves the newly selected playlist', revision.playlistId, playlistB.id);
    check('activeSchedule reflects the new playlist', revision.activeSchedule?.playlistId, playlistB.id);
    checkTruthy('sync is flagged as required after the swap', revision.syncRequired);

    // =================================================================== TEST 8
    console.log('\n=== TEST 8: All Devices targeting ===');
    // Clear device A's windows so an org-wide schedule has room.
    await prisma.schedule.deleteMany({ where: { organizationId: orgId, name: { startsWith: RUN } } });
    created.length = 0;

    const orgWideStart = wallClock(-30, timezone);
    const orgWideEnd = wallClock(30, timezone);
    const orgWide = await createSchedule({
      name: `${RUN} everywhere`,
      playlistId: playlistA.id,
      deviceId: null,
      startDate: orgWideStart.date,
      startTime: orgWideStart.time,
      endDate: orgWideEnd.date,
      endTime: orgWideEnd.time,
      enabled: true,
    });
    check('all-devices schedule stores deviceId as null', orgWide.deviceId, null);
    check('allDevices flag is true', orgWide.allDevices, true);
    check('device column is null in the DB', (await prisma.schedule.findUnique({ where: { id: orgWide.id } }))?.deviceId, null);

    const revisionA = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    const revisionB = await playerApi<SyncRevision>(deviceB.deviceToken!, '/player/sync-revision');
    check('device A picks up the all-devices schedule', revisionA.activeSchedule?.scheduleId, orgWide.id);
    check('device B picks up the all-devices schedule', revisionB.activeSchedule?.scheduleId, orgWide.id);
    check('device A plays the scheduled playlist', revisionA.playlistId, playlistA.id);
    check('device B plays it too, despite having no manual playlist', revisionB.playlistId, playlistA.id);

    // ============================================================== TEST 5/6/7
    console.log('\n=== TEST 5/6/7: a window ending hands over, then falls back ===');
    // Second-precision windows have to be written directly; the API takes HH:MM.
    await prisma.schedule.deleteMany({ where: { organizationId: orgId, name: { startsWith: RUN } } });
    created.length = 0;

    const now = Date.now();
    const endingSoon = await prisma.schedule.create({
      data: {
        organizationId: orgId,
        name: `${RUN} ending-soon`,
        playlistId: playlistA.id,
        deviceId: deviceA.id,
        startDateTime: new Date(now - 60_000),
        endDateTime: new Date(now + 4_000),
        enabled: true,
      },
    });
    const takingOver = await prisma.schedule.create({
      data: {
        organizationId: orgId,
        name: `${RUN} taking-over`,
        playlistId: playlistB.id,
        deviceId: deviceA.id,
        startDateTime: new Date(now + 4_000),
        endDateTime: new Date(now + 8_000),
        enabled: true,
      },
    });

    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('first window is serving playlist A', revision.activeSchedule?.scheduleId, endingSoon.id);
    check('first window playlist is A', revision.playlistId, playlistA.id);

    console.log('    waiting for the handover…');
    await sleep(5_000);
    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('second window took over without any CMS action', revision.activeSchedule?.scheduleId, takingOver.id);
    check('player is now served playlist B', revision.playlistId, playlistB.id);
    check('first schedule now reports completed', (await api<ScheduleResponse[]>('/client-data/schedules')).find((s) => s.id === endingSoon.id)?.status, 'completed');

    console.log('    waiting for the last window to end…');
    await sleep(4_500);
    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('no schedule remains active', revision.activeSchedule, null);
    check('device falls back to its manually assigned playlist', revision.playlistId, manualPlaylist.id);
    check('content source is manual again', revision.contentSource, 'manual-playlist');
    check('both schedules report completed', (await api<ScheduleResponse[]>('/client-data/schedules')).filter((s) => s.name.startsWith(RUN)).map((s) => s.status), ['completed', 'completed']);

    // ================================================================ TEST 12
    console.log('\n=== TEST 12: deleting an active schedule falls back immediately ===');
    await prisma.schedule.deleteMany({ where: { organizationId: orgId, name: { startsWith: RUN } } });
    const toDelete = await prisma.schedule.create({
      data: {
        organizationId: orgId,
        name: `${RUN} to-delete`,
        playlistId: playlistA.id,
        deviceId: deviceA.id,
        startDateTime: new Date(Date.now() - 60_000),
        endDateTime: new Date(Date.now() + 3_600_000),
        enabled: true,
      },
    });
    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('schedule is driving the device before deletion', revision.activeSchedule?.scheduleId, toDelete.id);

    await api(`/client-data/schedules/${toDelete.id}`, { method: 'DELETE' });
    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('deleted schedule disappears from sync', revision.activeSchedule, null);
    check('device falls back to the manual playlist', revision.playlistId, manualPlaylist.id);
    check('schedule row is gone', await prisma.schedule.findUnique({ where: { id: toDelete.id } }), null);

    // ============================================================= TEST 16/17
    console.log('\n=== TEST 16/17: device offline at start, correct content on reconnect ===');
    await prisma.device.update({
      where: { id: deviceA.id },
      data: { status: 'OFFLINE', lastAckedPlaylistId: null, lastAckedPlaylistVersion: null },
    });
    const startedWhileOffline = await prisma.schedule.create({
      data: {
        organizationId: orgId,
        name: `${RUN} started-offline`,
        playlistId: playlistB.id,
        deviceId: deviceA.id,
        startDateTime: new Date(Date.now() - 120_000),
        endDateTime: new Date(Date.now() + 3_600_000),
        enabled: true,
      },
    });
    const offlineListing = await api<ScheduleResponse[]>('/client-data/schedules');
    check('schedule went active while the device was offline', offlineListing.find((s) => s.id === startedWhileOffline.id)?.status, 'active');

    // The device "reconnects".
    revision = await playerApi<SyncRevision>(deviceA.deviceToken!, '/player/sync-revision');
    check('on reconnect the device is told about the running schedule', revision.activeSchedule?.scheduleId, startedWhileOffline.id);
    check('on reconnect the device gets the scheduled playlist', revision.playlistId, playlistB.id);
    checkTruthy('reconnecting device is told to sync', revision.syncRequired);

    const reconnectSync = await playerApi<{ playlist: { id: string } | null; syncRequired: boolean }>(
      deviceA.deviceToken!,
      '/player/sync',
    );
    check('the manifest it downloads is the scheduled playlist', reconnectSync.playlist?.id, playlistB.id);

    // ================================================================ TEST 18
    console.log('\n=== TEST 18b: filters, and no regression to devices/playlists ===');
    const allSchedules = await api<ScheduleResponse[]>('/client-data/schedules');
    const activeOnly = await api<ScheduleResponse[]>('/client-data/schedules?status=active');
    const scheduledOnly = await api<ScheduleResponse[]>('/client-data/schedules?status=scheduled');
    const byPlaylist = await api<ScheduleResponse[]>(`/client-data/schedules?playlistId=${playlistB.id}`);
    const byDevice = await api<ScheduleResponse[]>(`/client-data/schedules?deviceId=${deviceA.id}`);

    checkTruthy('unfiltered listing returns schedules', allSchedules.length > 0);
    check('status=active returns only active', activeOnly.every((s) => s.status === 'active'), true);
    check('status=scheduled returns only scheduled', scheduledOnly.every((s) => s.status === 'scheduled'), true);
    check('playlist filter is respected', byPlaylist.every((s) => s.playlistId === playlistB.id), true);
    check('device filter includes device-specific and all-devices rows', byDevice.every((s) => s.deviceId === deviceA.id || s.deviceId === null), true);

    const devices = await api<{ id: string }[]>('/client-data/devices');
    const playlists = await api<{ id: string }[]>('/client-data/playlists');
    const dashboard = await api<{ stats: unknown; schedulePreview: unknown[] }>('/client-data/dashboard');
    checkTruthy('devices endpoint still works', devices.length > 0);
    checkTruthy('playlists endpoint still works', playlists.length > 0);
    checkTruthy('dashboard still works', dashboard.stats);
    checkTruthy('dashboard schedule preview is an array', Array.isArray(dashboard.schedulePreview));

    check('old schedule-events endpoint is gone', (await apiRaw('/client-data/schedule-events')).status, 404);

    const manualDevice = await prisma.device.findUnique({ where: { id: deviceA.id } });
    check('scheduling never rewrote the manual assignment', manualDevice?.currentPlaylistId, manualPlaylist.id);
  } finally {
    // ------------------------------------------------------------- teardown
    await prisma.schedule.deleteMany({ where: { organizationId: orgId, name: { startsWith: RUN } } });
    await prisma.device.deleteMany({ where: { name: { startsWith: RUN } } });
    await prisma.playlist.deleteMany({ where: { name: { startsWith: RUN } } });
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scheduling e2e: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nFATAL', error);
  await prisma.$disconnect();
  process.exit(1);
});
