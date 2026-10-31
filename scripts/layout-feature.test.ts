import assert from 'node:assert/strict';
import test from 'node:test';
import { LayoutResolution, ZoneType } from '@prisma/client';
import { ClientDataService } from '../apps/api/src/client-data/client-data.service';
import { DeviceCacheService } from '../apps/api/src/device-cache/device-cache.service';
import { DeviceManagementService } from '../apps/api/src/device-management/device-management.service';
import { PlayerService } from '../apps/api/src/player/player.service';

const actor = {
  userId: 'user-1', email: 'editor@example.com', fullName: 'Editor', platformRole: null,
  organization: { id: 'org-1', slug: 'org', role: 'ORG_ADMIN' as const, status: 'ACTIVE' },
};

const tickerZone = (id?: string) => ({
  ...(id ? { id } : {}), name: 'Ticker', type: 'Ticker', x: 0, y: 80, w: 100, h: 20,
  zIndex: 0, color: '#00e5ff', playlistId: null, assetId: null,
});

function clientService(prisma: object, sync: object = {}) {
  return new ClientDataService(prisma as any, {} as any, sync as any, {} as any, {} as any, {} as any);
}

test('layout save rejects an overflowing zone before writing', async () => {
  let writes = 0;
  const prisma = {
    layout: { findFirst: async () => ({ id: 'layout-1', resolution: LayoutResolution.LANDSCAPE_1080P }) },
    device: { count: async () => 0 },
    layoutZone: { findMany: async () => [] },
    $transaction: async () => { writes++; },
  };
  await assert.rejects(
    clientService(prisma).saveLayoutZones(actor, 'layout-1', { zones: [{ ...tickerZone(), x: 50, w: 60 }] }),
    /extends beyond the screen/,
  );
  assert.equal(writes, 0);
});

test('layout save retains existing zone IDs, increments once, and notifies players', async () => {
  const operations: string[] = [];
  const tx = {
    layoutZone: {
      deleteMany: async () => operations.push('delete-removed'),
      update: async ({ where }: any) => operations.push(`update-${where.id}`),
      create: async () => operations.push('create-new'),
    },
    layout: { update: async ({ data }: any) => {
      assert.equal(data.syncVersion.increment, 1);
      operations.push('increment');
    } },
  };
  const prisma = {
    layout: { findFirst: async () => ({ id: 'layout-1', resolution: LayoutResolution.LANDSCAPE_1080P }) },
    device: { count: async () => 0 },
    layoutZone: { findMany: async () => [{ id: 'zone-1' }] },
    $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
  };
  const service = clientService(prisma, { notifyLayoutChanged: async () => operations.push('notify') });
  (service as any).getLayout = async () => ({ id: 'layout-1' });
  await service.saveLayoutZones(actor, 'layout-1', { zones: [tickerZone('zone-1'), tickerZone()] });
  assert.deepEqual(operations, ['delete-removed', 'update-zone-1', 'create-new', 'increment', 'notify']);
});

test('layout assignment rejects devices with a different orientation', async () => {
  const prisma = {
    layout: { findFirst: async () => ({ id: 'layout-1', resolution: LayoutResolution.PORTRAIT }) },
    device: { findMany: async ({ where }: any) => where.currentLayoutId ? [] : [
      { id: 'device-1', orientation: 'LANDSCAPE', currentLayoutId: null },
    ] },
  };
  await assert.rejects(
    clientService(prisma).assignLayout(actor, 'layout-1', { deviceIds: ['device-1'] }),
    /requires portrait devices/,
  );
});

test('removing a layout assignment notifies the previously assigned player', async () => {
  const notified: string[][] = [];
  const tx = {
    device: { updateMany: async ({ data }: any) => { assert.equal(data.currentLayoutId, null); } },
    layout: { update: async () => ({}) },
  };
  const prisma = {
    layout: { findFirst: async () => ({ id: 'layout-1', resolution: LayoutResolution.LANDSCAPE_1080P }) },
    device: { findMany: async () => [{ id: 'device-1' }] },
    $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
  };
  const service = clientService(prisma);
  (service as any).notifyDevicesSyncRequired = async (_org: string, ids: string[]) => notified.push(ids);
  (service as any).getLayout = async () => ({ id: 'layout-1' });
  await service.assignLayout(actor, 'layout-1', { deviceIds: [] });
  assert.deepEqual(notified, [['device-1']]);
});

test('layout sync keeps per-zone content and deduplicates download assets', async () => {
  const media = { id: 'asset-1', name: 'Image', type: 'IMAGE', position: 0, durationSeconds: null };
  const playlist = { id: 'playlist-1', name: 'Loop', syncVersion: 2, playlistAssets: [{ asset: media }] };
  const layout = {
    id: 'layout-1', name: 'Lobby', resolution: LayoutResolution.LANDSCAPE_1080P,
    syncVersion: 3, updatedAt: new Date('2026-10-29T00:00:00Z'), organizationId: 'org-1',
    zones: [
      { id: 'zone-1', name: 'Main', type: ZoneType.PLAYLIST, x: 0, y: 0, w: 60, h: 80, zIndex: 0, playlist, asset: null },
      { id: 'zone-2', name: 'Promo', type: ZoneType.IMAGE, x: 60, y: 0, w: 40, h: 80, zIndex: 1, assetId: 'asset-1', asset: media },
      { id: 'zone-3', name: 'News', type: ZoneType.TICKER, x: 0, y: 80, w: 100, h: 20, zIndex: 2, playlist: null, asset: null },
    ],
  };
  const prisma = {
    layout: { findUnique: async () => layout },
    device: { count: async () => 1, update: async () => ({}) },
  };
  const service = new PlayerService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  (service as any).fetchActiveTickers = async () => [{ id: 'ticker-1', text: 'Hello' }];
  (service as any).getTickerRevisionSuffix = async () => ':tk1';
  (service as any).buildPlaylistManifest = async () => [media];
  (service as any).buildAssetManifestEntry = async () => media;
  const response = await (service as any).syncLayout(
    { id: 'device-1', organizationId: 'org-1', currentLayoutId: 'layout-1', lastAckedLayoutVersion: null, lastAckedTickerRevision: null },
    {}, { knownAssetIds: [], missingAssetIds: new Set(), recoverCache: false, clientAssetVersions: new Map() },
  );
  assert.equal(response.layoutVersion, 3);
  assert.deepEqual(response.assets.map((asset: any) => asset.id), ['asset-1']);
  assert.equal(response.layout.zones[0].assets[0].id, 'asset-1');
  assert.equal(response.layout.zones[1].asset.id, 'asset-1');
  assert.equal(response.layout.zones[2].ticker.id, 'ticker-1');
  assert.deepEqual(response.tickers, []);
});

test('ticker removal clears a ticker zone and changes an otherwise stable layout response', async () => {
  const prisma = {
    layout: { findUnique: async () => ({
      id: 'layout-1', name: 'Lobby', resolution: LayoutResolution.LANDSCAPE_1080P,
      syncVersion: 3, updatedAt: new Date(), organizationId: 'org-1',
      zones: [{ id: 'zone-1', name: 'News', type: ZoneType.TICKER, x: 0, y: 80, w: 100, h: 20, zIndex: 0 }],
    }) },
    device: { count: async () => 1, update: async () => ({}) },
  };
  const service = new PlayerService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  (service as any).fetchActiveTickers = async () => [];
  (service as any).getTickerRevisionSuffix = async () => ':tk0';
  const response = await (service as any).syncLayout(
    { id: 'device-1', organizationId: 'org-1', currentLayoutId: 'layout-1', lastAckedLayoutVersion: 3, lastAckedTickerRevision: ':tk1' },
    { layoutVersion: 3 }, { knownAssetIds: [], missingAssetIds: new Set(), recoverCache: false, clientAssetVersions: new Map() },
  );
  assert.equal(response.unchanged, false);
  assert.equal(response.layout.zones[0].ticker, null);
  assert.deepEqual(response.tickers, []);
});

test('an active playlist schedule overrides the manual layout', async () => {
  const schedules = { resolveActiveScheduleForDevice: async () => ({ scheduleId: 'schedule-1', playlistId: 'playlist-1' }) };
  const service = new PlayerService({} as any, {} as any, {} as any, {} as any, {} as any, schedules as any, {} as any, {} as any);
  const effective = await (service as any).resolveEffectiveContent({
    id: 'device-1', organizationId: 'org-1', currentLayoutId: 'layout-1', currentPlaylistId: null,
    lastAckedScheduleId: 'schedule-1',
  });
  assert.equal(effective.source, 'schedule');
  assert.equal(effective.playlistId, 'playlist-1');
  assert.equal(effective.layoutId, null);
});

test('empty sync explicitly clears layout state and removes old cached assets', async () => {
  const prisma = { device: { update: async () => ({}) } };
  const service = new PlayerService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  (service as any).fetchActiveTickers = async () => [];
  (service as any).getTickerRevisionSuffix = async () => ':tk0';
  const response = await (service as any).buildPlaylistSyncResponse(
    { id: 'device-1', organizationId: 'org-1', currentPlaylistId: null, lastAckedScheduleId: null },
    {}, { knownAssetIds: ['asset-1'], missingAssetIds: new Set(), recoverCache: false, clientAssetVersions: new Map() },
  );
  assert.equal(response.layout, null);
  assert.equal(response.layoutVersion, null);
  assert.equal(response.playlist, null);
  assert.deepEqual(response.removedAssetIds, ['asset-1']);
  assert.deepEqual(response.tickers, []);
});

test('missing local files receive a fresh download URL even at the same asset version', async () => {
  const s3 = { generateDownloadUrl: async () => 'https://media.example.test/signed' };
  const service = new PlayerService({} as any, s3 as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  const entry = await (service as any).buildAssetManifestEntry({
    id: 'asset-1', name: 'Image', type: 'IMAGE', mimeType: 'image/png', status: 'READY',
    s3Key: 'org/assets/asset-1/image.png', url: null, fileSize: 123, contentVersion: 2,
    contentHash: 'abc', updatedAt: new Date(),
  }, null, 0, {
    knownAssetIds: ['asset-1'], clientAssetVersions: new Map([['asset-1', 2]]),
    recoverCache: false, missingAssetIds: new Set(['asset-1']),
  });
  assert.equal(entry.requiresDownload, true);
  assert.equal(entry.downloadUrl, 'https://media.example.test/signed');
});

test('a stale cache report cannot acknowledge a replacement layout', async () => {
  let acknowledgements = 0;
  const cache = new DeviceCacheService({} as any, {} as any);
  await (cache as any).ackContentRevisionFromCacheReport({
    layout: { findFirst: async () => ({ id: 'old-layout', syncVersion: 2 }) },
    device: { update: async () => { acknowledgements++; } },
  }, {
    id: 'device-1', currentLayoutId: 'new-layout', currentPlaylistId: null, pendingInitialSync: false,
  }, {
    currentLayoutId: 'old-layout', layoutVersion: 2, pendingDownloadCount: 0, syncStatus: 'OK',
  });
  assert.equal(acknowledgements, 0);
});

test('device orientation cannot change away from its assigned layout', async () => {
  const prisma = {
    device: { findFirst: async () => ({ id: 'device-1', organizationId: 'org-1', currentLayoutId: 'layout-1' }) },
    layout: { findUnique: async () => ({ resolution: LayoutResolution.PORTRAIT }) },
  };
  const devices = new DeviceManagementService(prisma as any, {} as any);
  await assert.rejects(
    devices.updateDeviceDisplaySettings('device-1', 'org-1', { orientation: 'LANDSCAPE' }),
    /orientation must match/,
  );
});
