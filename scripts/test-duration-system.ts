/**
 * End-to-end test suite for the two-level playback duration system.
 *
 *   Priority: playlist durationSeconds (explicit)  >  device default duration
 *
 * Runs against a live API. Uses the real pairing flow to obtain a device token so
 * TEST 9 exercises the genuine /api/player/sync manifest the Android player reads.
 *
 * Usage:  npx tsx scripts/test-duration-system.ts
 * Env:    VERIFY_API_URL (default http://localhost:3001/api)
 *         VERIFY_EMAIL / VERIFY_PASSWORD (default seeded org admin)
 */
import { PrismaClient } from '@prisma/client';

const API = process.env.VERIFY_API_URL ?? 'http://localhost:3001/api';
const EMAIL = process.env.VERIFY_EMAIL ?? 'orgadmin@acme.com';
const PASSWORD = process.env.VERIFY_PASSWORD ?? 'orgadmin123';
const TAG = 'durtest';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentTest = '';

function test(name: string) {
  currentTest = name;
  console.log(`\n─── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`);
}

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else {
    failed += 1;
    failures.push(`${currentTest} :: ${label}\n    EXPECTED: ${JSON.stringify(expected)}\n    ACTUAL:   ${JSON.stringify(actual)}`);
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
}

let token = '';
let orgId = '';

async function raw(path: string, init: RequestInit = {}, auth = true) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
      ...(auth && orgId ? { 'x-organization-id': orgId } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return text;
}

async function api<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const text = await raw(path, init, auth);
  return (text ? JSON.parse(text) : null) as T;
}

type PlaylistItem = { playlistAssetId: string; durationSeconds: number | null; position: number; name: string };

async function cleanup() {
  await prisma.playlist.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.asset.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.device.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  // ── Setup ────────────────────────────────────────────────────────────────
  const login = await api<{ accessToken?: string; token?: string }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
    false,
  );
  token = login.accessToken ?? login.token ?? '';
  if (!token) throw new Error('Login failed');

  const membership = await prisma.organizationMembership.findFirst({
    where: { user: { email: EMAIL }, status: 'ACTIVE' },
  });
  if (!membership) throw new Error('No active membership');
  orgId = membership.organizationId;

  await cleanup();

  const mkAsset = async (key: string, type: 'IMAGE' | 'VIDEO') =>
    prisma.asset.create({
      data: {
        organizationId: orgId,
        name: `${TAG}-${key}`,
        type,
        mimeType: type === 'IMAGE' ? 'image/jpeg' : 'video/mp4',
        status: 'READY',
        s3Key: `${TAG}/${key}`,
        fileSize: 1024,
        uploadedById: membership.userId,
      },
    });

  const assetImg1 = await mkAsset('img1', 'IMAGE');
  const assetImg2 = await mkAsset('img2', 'IMAGE');
  const assetVid1 = await mkAsset('vid1', 'VIDEO');
  const assetVid2 = await mkAsset('vid2', 'VIDEO');
  const assetVid3 = await mkAsset('vid3', 'VIDEO');

  const playlist = await prisma.playlist.create({
    data: { organizationId: orgId, name: `${TAG}-playlist` },
  });

  // Pair a device through the real player pairing handshake (no token injection).
  const hardwareId = `${TAG}-hw-${Date.now()}`;
  const init = await api<{ pairingCode: string; pairingSecret: string }>(
    '/player/init-pairing',
    { method: 'POST', body: JSON.stringify({ hardwareId, deviceName: `${TAG}-device` }) },
    false,
  );
  await api('/client-data/devices/pair', {
    method: 'POST',
    body: JSON.stringify({ pairingCode: init.pairingCode, name: `${TAG}-device` }),
  });
  const status = await api<{ deviceToken: string; deviceId: string }>(
    `/player/pairing-status/${hardwareId}?pairingSecret=${encodeURIComponent(init.pairingSecret)}`,
    {},
    false,
  );
  const deviceToken = status.deviceToken;
  const device = await prisma.device.findFirstOrThrow({ where: { hardwareId } });
  if (!deviceToken) throw new Error('Pairing did not yield a device token');

  console.log(`\nsetup: playlist=${playlist.id} device=${device.id} (paired via real handshake)`);

  const playerSync = async () =>
    api<{ assets: { id: string; type: string; durationSeconds: number | null }[]; display: { playback: Record<string, number> } }>(
      '/player/sync',
      { headers: { authorization: `Bearer ${deviceToken}` } },
      false,
    );

  const listItems = () => api<PlaylistItem[]>(`/client-data/playlists/${playlist.id}/assets`);
  const dbRows = () =>
    prisma.playlistAsset.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
      select: { id: true, assetId: true, durationSeconds: true, position: true, updatedAt: true },
    });

  const addAsset = (assetId: string, body: Record<string, unknown> = {}) =>
    api<{ playlistAssetId: string; durationSeconds: number | null }>(
      `/client-data/playlists/${playlist.id}/assets`,
      { method: 'POST', body: JSON.stringify({ assetId, ...body }) },
    );

  const setDuration = (paId: string, durationSeconds: number | null) =>
    api(`/client-data/playlists/${playlist.id}/assets/${paId}`, {
      method: 'PATCH',
      body: JSON.stringify({ durationSeconds }),
    });

  // ══ TEST 1 — NEW PLAYLIST ASSET ══════════════════════════════════════════
  test('TEST 1 — NEW PLAYLIST ASSET');
  const rawAdd = await raw(`/client-data/playlists/${playlist.id}/assets`, {
    method: 'POST',
    body: JSON.stringify({ assetId: assetImg1.id }), // durationSeconds omitted entirely
  });
  const add1 = JSON.parse(rawAdd) as { playlistAssetId: string; durationSeconds: unknown };
  check('POST response durationSeconds is null (omitted in request)', add1.durationSeconds, null);
  check('response is JSON null, not 10 / 0 / -1 / "10" / ""', typeof add1.durationSeconds === 'object' && add1.durationSeconds === null, true);
  check('raw JSON body literally contains "durationSeconds":null', /"durationSeconds":\s*null/.test(rawAdd), true);
  const row1 = await prisma.playlistAsset.findUniqueOrThrow({ where: { id: add1.playlistAssetId } });
  check('DB row durationSeconds IS NULL', row1.durationSeconds, null);
  const paImg1 = add1.playlistAssetId;

  // ══ TEST 2 — EXPLICIT PLAYLIST DURATION ══════════════════════════════════
  test('TEST 2 — EXPLICIT PLAYLIST DURATION');
  await setDuration(paImg1, 20);
  const dbImg1 = await prisma.playlistAsset.findUniqueOrThrow({ where: { id: paImg1 } });
  check('DB durationSeconds = 20', dbImg1.durationSeconds, 20);
  const reopen1 = await listItems();
  check('reopened playlist shows 20', reopen1.find((i) => i.playlistAssetId === paImg1)?.durationSeconds, 20);

  // ══ TEST 3 — BLANK PLAYLIST DURATION ═════════════════════════════════════
  test('TEST 3 — BLANK PLAYLIST DURATION');
  const add2 = await addAsset(assetImg2.id, { durationSeconds: null });
  const paImg2 = add2.playlistAssetId;
  check('add with explicit null -> null', add2.durationSeconds, null);
  const reopen2 = await listItems();
  check('after reload DB/API still NULL', reopen2.find((i) => i.playlistAssetId === paImg2)?.durationSeconds, null);
  const dbImg2 = await prisma.playlistAsset.findUniqueOrThrow({ where: { id: paImg2 } });
  check('DB row still NULL after reload', dbImg2.durationSeconds, null);

  // Videos for tests 5/6
  const addV1 = await addAsset(assetVid1.id, { durationSeconds: null });
  const addV2 = await addAsset(assetVid2.id, { durationSeconds: null });
  const addV3 = await addAsset(assetVid3.id, { durationSeconds: null });
  await setDuration(addV1.playlistAssetId, 20);

  // Assign playlist so the player manifest carries these items (needed for 4/5/6/9).
  await api(`/client-data/playlists/${playlist.id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ deviceIds: [device.id] }),
  });

  /** Mirror of the documented player rule: playlist override, else device default. */
  const effective = (manifestDuration: number | null, type: string, playback: Record<string, number>) => {
    if (manifestDuration != null) return manifestDuration;
    if (type === 'IMAGE') return playback.imageDuration;
    if (type === 'VIDEO') return playback.videoDuration;
    if (type === 'DOCUMENT') return playback.documentDuration;
    return playback.urlDuration;
  };

  // ══ TEST 4 — DEVICE DEFAULT (images) ═════════════════════════════════════
  test('TEST 4 — DEVICE DEFAULT');
  await api(`/client-data/devices/${device.id}/playback-settings`, {
    method: 'PATCH',
    body: JSON.stringify({ imageDuration: 10, videoDuration: 10 }),
  });
  let sync = await playerSync();
  check('sync display.playback.imageDuration = 10', sync.display.playback.imageDuration, 10);
  check('sync display.playback.videoDuration = 10', sync.display.playback.videoDuration, 10);
  const byAsset = (s: typeof sync, assetId: string) => s.assets.find((a) => a.id === assetId)!;
  check('manifest Image 1 durationSeconds = 20', byAsset(sync, assetImg1.id).durationSeconds, 20);
  check('manifest Image 2 durationSeconds = null', byAsset(sync, assetImg2.id).durationSeconds, null);
  check('effective Image 1 = 20 (override wins)', effective(byAsset(sync, assetImg1.id).durationSeconds, 'IMAGE', sync.display.playback), 20);
  check('effective Image 2 = 10 (device default)', effective(byAsset(sync, assetImg2.id).durationSeconds, 'IMAGE', sync.display.playback), 10);

  // ══ TEST 5 — VIDEO ═══════════════════════════════════════════════════════
  test('TEST 5 — VIDEO');
  check('manifest Video 1 = 20', byAsset(sync, assetVid1.id).durationSeconds, 20);
  check('manifest Video 2 = null', byAsset(sync, assetVid2.id).durationSeconds, null);
  check('manifest Video 3 = null', byAsset(sync, assetVid3.id).durationSeconds, null);
  check('effective Video 1 = 20', effective(byAsset(sync, assetVid1.id).durationSeconds, 'VIDEO', sync.display.playback), 20);
  check('effective Video 2 = 10', effective(byAsset(sync, assetVid2.id).durationSeconds, 'VIDEO', sync.display.playback), 10);
  check('effective Video 3 = 10', effective(byAsset(sync, assetVid3.id).durationSeconds, 'VIDEO', sync.display.playback), 10);

  // ══ TEST 6 — CHANGE DEVICE DEFAULT ═══════════════════════════════════════
  test('TEST 6 — CHANGE DEVICE DEFAULT (10 -> 15)');
  const rowsBefore = await dbRows();
  await api(`/client-data/devices/${device.id}/playback-settings`, {
    method: 'PATCH',
    body: JSON.stringify({ imageDuration: 15, videoDuration: 15 }),
  });
  const rowsAfter = await dbRows();
  check('every PlaylistAsset row byte-identical (incl. updatedAt)', rowsAfter, rowsBefore);

  sync = await playerSync();
  check('DB Image 1 still 20', (await prisma.playlistAsset.findUniqueOrThrow({ where: { id: paImg1 } })).durationSeconds, 20);
  check('DB Image 2 still NULL', (await prisma.playlistAsset.findUniqueOrThrow({ where: { id: paImg2 } })).durationSeconds, null);
  check('effective Image 1 = 20', effective(byAsset(sync, assetImg1.id).durationSeconds, 'IMAGE', sync.display.playback), 20);
  check('effective Image 2 = 15', effective(byAsset(sync, assetImg2.id).durationSeconds, 'IMAGE', sync.display.playback), 15);
  check('effective Video 1 = 20', effective(byAsset(sync, assetVid1.id).durationSeconds, 'VIDEO', sync.display.playback), 20);
  check('effective Video 2 = 15', effective(byAsset(sync, assetVid2.id).durationSeconds, 'VIDEO', sync.display.playback), 15);
  check('effective Video 3 = 15', effective(byAsset(sync, assetVid3.id).durationSeconds, 'VIDEO', sync.display.playback), 15);

  // ══ TEST 7 — CLEAR AN OVERRIDE ═══════════════════════════════════════════
  test('TEST 7 — CLEAR AN OVERRIDE (20 -> NULL)');
  await setDuration(paImg1, null);
  check('DB durationSeconds now NULL', (await prisma.playlistAsset.findUniqueOrThrow({ where: { id: paImg1 } })).durationSeconds, null);
  sync = await playerSync();
  check('manifest now null', byAsset(sync, assetImg1.id).durationSeconds, null);
  check('effective now device default 15', effective(byAsset(sync, assetImg1.id).durationSeconds, 'IMAGE', sync.display.playback), 15);
  await setDuration(paImg1, 20); // restore for later tests

  // ══ TEST 8 — REORDER PLAYLIST ════════════════════════════════════════════
  test('TEST 8 — REORDER PLAYLIST');
  const p2 = await prisma.playlist.create({ data: { organizationId: orgId, name: `${TAG}-reorder` } });
  const mk = async (assetId: string, dur: number | null) =>
    (await api<{ playlistAssetId: string }>(`/client-data/playlists/${p2.id}/assets`, {
      method: 'POST',
      body: JSON.stringify({ assetId, durationSeconds: dur }),
    })).playlistAssetId;
  const A = await mk(assetImg1.id, 20);
  const B = await mk(assetImg2.id, null);
  const C = await mk(assetVid1.id, 15);
  const D = await mk(assetVid2.id, null);

  const expectedByPa: Record<string, number | null> = { [A]: 20, [B]: null, [C]: 15, [D]: null };
  const reversed = [D, C, B, A];
  await api(`/client-data/playlists/${p2.id}/assets/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ playlistAssetIds: reversed }),
  });
  const afterReorder = await api<PlaylistItem[]>(`/client-data/playlists/${p2.id}/assets`);
  check('order is now D,C,B,A', afterReorder.map((i) => i.playlistAssetId), reversed);
  for (const [label, paId] of [['A', A], ['B', B], ['C', C], ['D', D]] as const) {
    check(
      `${label} keeps its duration after reorder`,
      afterReorder.find((i) => i.playlistAssetId === paId)?.durationSeconds ?? null,
      expectedByPa[paId],
    );
  }

  // ══ TEST 9 — PLAYLIST UPDATE REACHES PLAYER ══════════════════════════════
  test('TEST 9 — PLAYLIST UPDATE REACHES PLAYER');
  await setDuration(addV1.playlistAssetId, 45); // explicit 20 -> 45
  await setDuration(paImg1, null); // explicit 20 -> NULL
  sync = await playerSync();
  check('changed explicit duration reaches player as 45', byAsset(sync, assetVid1.id).durationSeconds, 45);
  check('explicit -> NULL reaches player as null', byAsset(sync, assetImg1.id).durationSeconds, null);
  check('effective Video 1 = 45 (override)', effective(byAsset(sync, assetVid1.id).durationSeconds, 'VIDEO', sync.display.playback), 45);
  check('effective Image 1 = 15 (device default)', effective(byAsset(sync, assetImg1.id).durationSeconds, 'IMAGE', sync.display.playback), 15);

  // ══ TEST 10 — API CONTRACT ═══════════════════════════════════════════════
  test('TEST 10 — API CONTRACT (raw JSON)');
  const rawList = await raw(`/client-data/playlists/${playlist.id}/assets`);
  check('CMS list emits explicit JSON null (not omitted)', /"durationSeconds":\s*null/.test(rawList), true);
  check('CMS list emits explicit integer for overrides', /"durationSeconds":\s*45/.test(rawList), true);
  const rawSync = await raw('/player/sync', { headers: { authorization: `Bearer ${deviceToken}` } }, false);
  check('player manifest emits explicit JSON null', /"durationSeconds":\s*null/.test(rawSync), true);
  check('player manifest emits explicit integer override', /"durationSeconds":\s*45/.test(rawSync), true);
  check('no null->10 transformation anywhere in manifest', /"durationSeconds":\s*10\b/.test(rawSync), false);
  const rawSettings = await raw(`/client-data/devices/${device.id}/playback-settings`);
  const settings = JSON.parse(rawSettings);
  check('device settings returned separately (imageDuration)', settings.imageDuration, 15);
  check('device settings returned separately (videoDuration)', settings.videoDuration, 15);
  check('device defaults are NOT merged into playlist items', /"imageDuration"/.test(rawList), false);

  await cleanup();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`PASSED: ${passed}    FAILED: ${failed}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log('═'.repeat(64));
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch(async (err) => {
    console.error('\nSUITE ERROR:', err);
    await cleanup().catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
