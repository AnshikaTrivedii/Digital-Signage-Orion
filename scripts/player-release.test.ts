import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PlayerReleaseService, parsePlayerApkMetadata } from '../apps/api/src/player-release/player-release.service';

const certificate = 'a'.repeat(64);

test('APK metadata parser accepts the Orion package and a signed increasing version', () => {
  assert.deepEqual(parsePlayerApkMetadata(
    "package: name='com.orion.player' versionCode='67' versionName='1.0.66'\n",
    `Signer #1 certificate SHA-256 digest: ${certificate}\n`,
  ), { versionCode: 67, versionName: '1.0.66', certificate });
  assert.throws(() => parsePlayerApkMetadata(
    "package: name='com.example.other' versionCode='67' versionName='1.0.66'",
    `Signer #1 certificate SHA-256 digest: ${certificate}`,
  ), BadRequestException);
  assert.throws(() => parsePlayerApkMetadata(
    "package: name='com.orion.player' versionCode='67' versionName='1.0.66'",
    `Signer #1 certificate SHA-256 digest: ${certificate}\nSigner #2 certificate SHA-256 digest: ${'b'.repeat(64)}`,
  ), BadRequestException);
});

test('only an active newer release is offered; blocked devices are excluded', async () => {
  const release = {
    id: 'release-1', versionCode: 67, versionName: '1.0.66', sizeBytes: 123,
    sha256: 'b'.repeat(64), apkKey: 'player-releases/verified.apk',
  };
  let active: typeof release | null = release;
  let state: string | null = null;
  let created = 0;
  const prisma = {
    playerRelease: { findFirst: async () => active },
    deviceAppUpdate: {
      findUnique: async () => state ? { state } : null,
      create: async () => { created++; },
    },
  };
  const s3 = { generateDownloadUrl: async () => 'https://example.test/player.apk' };
  const service = new PlayerReleaseService(prisma as never, s3 as never, {} as never);

  assert.equal(await service.available('device-1', 67), null);
  const offer = await service.available('device-1', 66);
  assert.equal(offer?.versionCode, 67);
  assert.equal(created, 1);
  state = 'BLOCKED';
  assert.equal(await service.available('device-1', 66), null);
  state = null;
  active = null;
  assert.equal(await service.available('device-1', 66), null);
});

test('a healthy report must match the release version code', async () => {
  const prisma = {
    playerRelease: { findUnique: async () => ({ id: 'release-1', versionCode: 67 }) },
    deviceAppUpdate: { findUnique: async () => null, upsert: async () => ({ state: 'HEALTHY' }) },
  };
  const service = new PlayerReleaseService(prisma as never, {} as never, {} as never);
  await assert.rejects(
    service.report('device-1', { releaseId: 'release-1', state: 'HEALTHY', installedVersionCode: 66 }),
    BadRequestException,
  );
  assert.deepEqual(
    await service.report('device-1', { releaseId: 'release-1', state: 'HEALTHY', installedVersionCode: 67 }),
    { state: 'HEALTHY' },
  );
});

test('a blocked report must include a reason', async () => {
  const service = new PlayerReleaseService({} as never, {} as never, {} as never);
  await assert.rejects(
    service.report('device-1', { releaseId: 'release-1', state: 'BLOCKED' }),
    BadRequestException,
  );
});

test('activation rejects an unverified or older release', async () => {
  let candidate: { status: string; verifiedAt: Date | null; versionCode: number; sha256: string } = {
    status: 'DRAFT', verifiedAt: null, versionCode: 68, sha256: 'c'.repeat(64),
  };
  const prisma = {
    playerRelease: {
      findUnique: async () => candidate,
      findFirst: async () => ({ versionCode: 69 }),
    },
  };
  const service = new PlayerReleaseService(prisma as never, {} as never, {} as never);
  await assert.rejects(service.activate('release-2', 'admin-1'), BadRequestException);
  candidate = { ...candidate, verifiedAt: new Date() };
  await assert.rejects(service.activate('release-2', 'admin-1'), BadRequestException);
  candidate = { ...candidate, status: 'INACTIVE', versionCode: 70 };
  await assert.rejects(service.activate('release-2', 'admin-1'), BadRequestException);
});
