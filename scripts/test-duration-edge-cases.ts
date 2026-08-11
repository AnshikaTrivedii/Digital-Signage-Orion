/**
 * Adversarial probe for the playlist duration API.
 *
 * Confirms the API never silently coerces a bad/blank duration into a number,
 * and that the values TEST 1 forbids (10, 0, -1, "10", "") cannot land in the DB.
 *
 * Usage: npx tsx scripts/test-duration-edge-cases.ts
 */
import { PrismaClient } from '@prisma/client';

const API = process.env.VERIFY_API_URL ?? 'http://localhost:3001/api';
const EMAIL = process.env.VERIFY_EMAIL ?? 'orgadmin@acme.com';
const PASSWORD = process.env.VERIFY_PASSWORD ?? 'orgadmin123';
const TAG = 'duredge';

const prisma = new PrismaClient();
let token = '';
let orgId = '';
let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (passed += 1) : (failed += 1);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
}

async function call(path: string, init: RequestInit = {}, auth = true) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
      ...(auth && orgId ? { 'x-organization-id': orgId } : {}),
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  const login = JSON.parse((await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }, false)).text);
  token = login.accessToken ?? login.token;
  const membership = await prisma.organizationMembership.findFirstOrThrow({ where: { user: { email: EMAIL }, status: 'ACTIVE' } });
  orgId = membership.organizationId;

  await prisma.playlist.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.asset.deleteMany({ where: { name: { startsWith: TAG } } });

  const asset = await prisma.asset.create({
    data: {
      organizationId: orgId, name: `${TAG}-img`, type: 'IMAGE', mimeType: 'image/jpeg',
      status: 'READY', s3Key: `${TAG}/img`, fileSize: 1024, uploadedById: membership.userId,
    },
  });
  const playlist = await prisma.playlist.create({ data: { organizationId: orgId, name: `${TAG}-pl` } });

  console.log('\n─── ADD with hostile durationSeconds values ───');
  // Each case: [sent value, expected outcome]
  const addCases: [unknown, 'rejected' | 'null' | number][] = [
    [undefined, 'null'],
    [null, 'null'],
    [0, 'rejected'],
    [-1, 'rejected'],
    ['', 'rejected'],
    ['10', 'rejected'],
    [1.9, 'rejected'],
    [true, 'rejected'],
  ];

  for (const [value, expectation] of addCases) {
    const body: Record<string, unknown> = { assetId: asset.id };
    if (value !== undefined) body.durationSeconds = value;
    const res = await call(`/client-data/playlists/${playlist.id}/assets`, { method: 'POST', body: JSON.stringify(body) });
    const label = `add durationSeconds=${JSON.stringify(value)}`;

    if (expectation === 'rejected') {
      check(`${label} -> 4xx rejected`, res.status >= 400 && res.status < 500, true);
    } else {
      const parsed = JSON.parse(res.text);
      check(`${label} -> stored NULL`, parsed.durationSeconds, null);
    }
  }

  console.log('\n─── PATCH with hostile durationSeconds values ───');
  const seed = JSON.parse((await call(`/client-data/playlists/${playlist.id}/assets`, {
    method: 'POST', body: JSON.stringify({ assetId: asset.id, durationSeconds: 20 }),
  })).text);
  const paId = seed.playlistAssetId;

  const patchCases: [unknown, 'rejected' | 'null' | number][] = [
    [null, 'null'],
    [0, 'rejected'],
    [-1, 'rejected'],
    ['', 'rejected'],
    ['10', 'rejected'],
    [1.9, 'rejected'],
  ];

  for (const [value, expectation] of patchCases) {
    await call(`/client-data/playlists/${playlist.id}/assets/${paId}`, { method: 'PATCH', body: JSON.stringify({ durationSeconds: 20 }) });
    const res = await call(`/client-data/playlists/${playlist.id}/assets/${paId}`, { method: 'PATCH', body: JSON.stringify({ durationSeconds: value }) });
    const row = await prisma.playlistAsset.findUniqueOrThrow({ where: { id: paId } });
    const label = `patch durationSeconds=${JSON.stringify(value)}`;

    if (expectation === 'rejected') {
      check(`${label} -> 4xx rejected`, res.status >= 400 && res.status < 500, true);
      check(`${label} -> DB unchanged (still 20)`, row.durationSeconds, 20);
    } else {
      check(`${label} -> DB NULL`, row.durationSeconds, null);
    }
  }

  console.log('\n─── No forbidden value ever reached the DB ───');
  const all = await prisma.playlistAsset.findMany({ where: { playlistId: playlist.id }, select: { durationSeconds: true } });
  const values = all.map((r) => r.durationSeconds);
  check('no 0 in DB', values.includes(0), false);
  check('no negative in DB', values.some((v) => v !== null && v < 0), false);
  check('every value is null or a positive integer', values.every((v) => v === null || (Number.isInteger(v) && v > 0)), true);

  await prisma.playlist.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.asset.deleteMany({ where: { name: { startsWith: TAG } } });

  console.log(`\nPASSED: ${passed}   FAILED: ${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
