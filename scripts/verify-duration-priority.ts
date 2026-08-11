/**
 * Verifies the two-level playback duration system end to end against a running API.
 *
 *   Playlist durationSeconds (explicit)  >  Device default duration
 *
 * The critical assertion is that mutating device defaults leaves every PlaylistAsset
 * row byte-identical (including updatedAt), so an explicit playlist duration can
 * never be clobbered by a device-level change.
 *
 * Usage: npx tsx scripts/verify-duration-priority.ts
 */
import { PrismaClient } from '@prisma/client';

const API = process.env.VERIFY_API_URL ?? 'http://localhost:3001/api';
const EMAIL = process.env.VERIFY_EMAIL ?? 'orgadmin@acme.com';
const PASSWORD = process.env.VERIFY_PASSWORD ?? 'orgadmin123';

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
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

async function main() {
  const login = await api<{ accessToken?: string; token?: string; user?: { organizationId?: string } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
  );
  token = login.accessToken ?? login.token ?? '';
  if (!token) throw new Error(`No token in login response: ${JSON.stringify(login)}`);

  const membership = await prisma.organizationMembership.findFirst({
    where: { user: { email: EMAIL }, status: 'ACTIVE' },
  });
  orgId = membership?.organizationId ?? login.user?.organizationId ?? '';
  if (!orgId) throw new Error('Could not resolve organizationId');

  const device =
    (await prisma.device.findFirst({ where: { organizationId: orgId, isPaired: true } }))
    ?? (await prisma.device.create({
      data: {
        organizationId: orgId,
        name: 'dur-verify-device',
        hardwareId: `dur-verify-${Date.now()}`,
        isPaired: true,
      },
    }));

  // --- Fixture: 2 images + 3 videos in a throwaway playlist -------------------
  const needed = [
    { key: 'Image 1', type: 'IMAGE' as const },
    { key: 'Image 2', type: 'IMAGE' as const },
    { key: 'Video 1', type: 'VIDEO' as const },
    { key: 'Video 2', type: 'VIDEO' as const },
    { key: 'Video 3', type: 'VIDEO' as const },
  ];

  const assets = [];
  for (const spec of needed) {
    const name = `dur-verify-${spec.key.replace(' ', '').toLowerCase()}`;
    const existing = await prisma.asset.findFirst({ where: { organizationId: orgId, name } });
    assets.push(
      existing
        ?? (await prisma.asset.create({
          data: {
            organizationId: orgId,
            name,
            type: spec.type,
            mimeType: spec.type === 'IMAGE' ? 'image/jpeg' : 'video/mp4',
            status: 'READY',
            s3Key: `verify/${name}`,
            fileSize: 1024,
            uploadedById: membership!.userId,
          },
        })),
    );
  }

  await prisma.playlist.deleteMany({ where: { organizationId: orgId, name: 'dur-verify-playlist' } });
  const playlist = await prisma.playlist.create({
    data: { organizationId: orgId, name: 'dur-verify-playlist' },
  });

  console.log(`\nplaylist=${playlist.id} device=${device.id}\n`);

  // --- Step 1: add all five through the real API with no duration ------------
  const added: Record<string, string> = {};
  for (let i = 0; i < needed.length; i += 1) {
    const res = await api<{ playlistAssetId: string; durationSeconds: number | null }>(
      `/client-data/playlists/${playlist.id}/assets`,
      { method: 'POST', body: JSON.stringify({ assetId: assets[i].id, durationSeconds: null }) },
    );
    added[needed[i].key] = res.playlistAssetId;
    check(`add "${needed[i].key}" returns null duration (no auto-fill)`, res.durationSeconds, null);
  }

  // --- Step 2: set explicit overrides on Image 1 and Video 1 -----------------
  for (const key of ['Image 1', 'Video 1']) {
    await api(`/client-data/playlists/${playlist.id}/assets/${added[key]}`, {
      method: 'PATCH',
      body: JSON.stringify({ durationSeconds: 20 }),
    });
  }

  const readDurations = async () => {
    const items = await api<{ playlistAssetId: string; durationSeconds: number | null }[]>(
      `/client-data/playlists/${playlist.id}/assets`,
    );
    const byKey: Record<string, number | null> = {};
    for (const [key, id] of Object.entries(added)) {
      byKey[key] = items.find((i) => i.playlistAssetId === id)?.durationSeconds ?? null;
    }
    return byKey;
  };

  const snapshotRows = async () =>
    prisma.playlistAsset.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
      select: { id: true, durationSeconds: true, position: true, updatedAt: true },
    });

  // --- Step 3: device defaults = Images 10 / Videos 10 -----------------------
  const settings10 = await api<Record<string, number>>(
    `/client-data/devices/${device.id}/playback-settings`,
    { method: 'PATCH', body: JSON.stringify({ imageDuration: 10, videoDuration: 10 }) },
  );
  check('device settings expose imageDuration', settings10.imageDuration, 10);
  check('device settings expose videoDuration', settings10.videoDuration, 10);

  const before = await snapshotRows();
  const stored = await readDurations();

  console.log('\n-- Playlist rows are overrides or NULL, never the device default --');
  check('Image 1 stored', stored['Image 1'], 20);
  check('Image 2 stored', stored['Image 2'], null);
  check('Video 1 stored', stored['Video 1'], 20);
  check('Video 2 stored', stored['Video 2'], null);
  check('Video 3 stored', stored['Video 3'], null);

  // Effective playback = what the player computes from (playlist ?? device default).
  const resolve = (playlistValue: number | null, deviceDefault: number) => playlistValue ?? deviceDefault;

  console.log('\n-- Effective playback with Image=10, Video=10 --');
  check('Image 1 plays', resolve(stored['Image 1'], 10), 20);
  check('Image 2 plays', resolve(stored['Image 2'], 10), 10);
  check('Video 1 plays', resolve(stored['Video 1'], 10), 20);
  check('Video 2 plays', resolve(stored['Video 2'], 10), 10);
  check('Video 3 plays', resolve(stored['Video 3'], 10), 10);

  // --- Step 4: change image default 10 -> 15 --------------------------------
  const settings15 = await api<Record<string, number>>(
    `/client-data/devices/${device.id}/playback-settings`,
    { method: 'PATCH', body: JSON.stringify({ imageDuration: 15 }) },
  );
  check('device imageDuration updated', settings15.imageDuration, 15);
  check('device videoDuration untouched', settings15.videoDuration, 10);

  const after = await snapshotRows();
  const storedAfter = await readDurations();

  console.log('\n-- After device default 10 -> 15: no playlist record was modified --');
  check('PlaylistAsset rows byte-identical (incl. updatedAt)', after, before);
  check('Image 1 still 20', storedAfter['Image 1'], 20);
  check('Image 2 still NULL', storedAfter['Image 2'], null);

  console.log('\n-- Effective playback with Image=15 --');
  check('Image 1 plays', resolve(storedAfter['Image 1'], 15), 20);
  check('Image 2 plays', resolve(storedAfter['Image 2'], 15), 15);

  // --- Step 5: clearing an override reverts to NULL, not to 10 --------------
  await api(`/client-data/playlists/${playlist.id}/assets/${added['Image 1']}`, {
    method: 'PATCH',
    body: JSON.stringify({ durationSeconds: null }),
  });
  const cleared = await readDurations();
  check('cleared Image 1 becomes NULL (not 10)', cleared['Image 1'], null);
  check('cleared Image 1 now plays device default', resolve(cleared['Image 1'], 15), 15);

  await prisma.playlist.delete({ where: { id: playlist.id } });
  await prisma.asset.deleteMany({ where: { organizationId: orgId, name: { startsWith: 'dur-verify-' } } });

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
