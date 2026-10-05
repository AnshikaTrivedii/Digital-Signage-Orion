import { Prisma, PrismaClient, ProofOfPlayStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { putCount } from './metrics';

export type QueuedPopLog = {
  assetName: string;
  playlistId?: string;
  playlistName?: string;
  campaignName?: string;
  assetId?: string;
  status: 'VERIFIED' | 'FAILED';
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
};

export type PopLogBatchMessage = {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  receivedAt: string;
  logs: QueuedPopLog[];
};

type InsertedPopRow = {
  organizationId: string;
  deviceId: string | null;
  device: string;
  assetName: string;
  playlistName: string | null;
  campaignName: string | null;
  status: ProofOfPlayStatus;
  startTime: Date;
  durationSeconds: number | null;
};

function hourStartUtc(at: Date) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours()));
}

export async function consumePopLogBatch(prisma: PrismaClient, message: PopLogBatchMessage) {
  if (!message.logs?.length) return { inserted: 0 };

  await ensurePartitionsForLogs(prisma, message.logs);

  const playlistIds = [
    ...new Set(
      message.logs
        .map((log) => log.playlistId)
        .filter((playlistId): playlistId is string => Boolean(playlistId)),
    ),
  ];
  const playlists = playlistIds.length
    ? await prisma.playlist.findMany({
        where: { organizationId: message.organizationId, id: { in: playlistIds } },
        include: {
          playlistAssets: {
            include: { asset: { include: { folder: { select: { name: true } } } } },
          },
        },
      })
    : [];

  const contextByPlaylist = new Map<string, Map<string, { playlistName: string; campaignName: string | null; durationSeconds: number | null }>>();
  for (const playlist of playlists) {
    const assets = new Map<string, { playlistName: string; campaignName: string | null; durationSeconds: number | null }>();
    for (const slot of playlist.playlistAssets) {
      assets.set(slot.asset.name.trim().toLowerCase(), {
        playlistName: playlist.name,
        campaignName: slot.asset.folder?.name ?? null,
        durationSeconds: slot.durationSeconds,
      });
    }
    contextByPlaylist.set(playlist.id, assets);
  }

  const values: Prisma.Sql[] = [];
  for (const log of message.logs) {
    const startTime = new Date(log.startTime);
    if (Number.isNaN(startTime.getTime())) continue;
    const context = log.playlistId
      ? contextByPlaylist.get(log.playlistId)?.get(log.assetName.trim().toLowerCase())
      : undefined;
    let durationSeconds =
      typeof log.durationSeconds === 'number' && log.durationSeconds > 0
        ? Math.floor(log.durationSeconds)
        : context?.durationSeconds ?? null;
    let endTime = log.endTime ? new Date(log.endTime) : null;
    if (endTime && Number.isNaN(endTime.getTime())) endTime = null;
    if (!endTime && durationSeconds) {
      endTime = new Date(startTime.getTime() + durationSeconds * 1000);
    }
    if (!durationSeconds && endTime) {
      durationSeconds = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
    }
    const playlistName = log.playlistName?.trim() || context?.playlistName || null;
    const campaignName = log.campaignName?.trim() || context?.campaignName || null;
    const status = log.status === 'FAILED' ? ProofOfPlayStatus.FAILED : ProofOfPlayStatus.VERIFIED;

    values.push(Prisma.sql`(
      ${randomUUID()},
      ${message.organizationId},
      ${message.deviceId},
      ${message.deviceName},
      ${log.assetName},
      ${log.assetName},
      ${playlistName},
      ${campaignName},
      ${status}::text::"ProofOfPlayStatus",
      ${startTime},
      ${startTime},
      ${endTime},
      ${durationSeconds},
      NOW()
    )`);
  }

  if (!values.length) return { inserted: 0 };

  const inserted = await prisma.$queryRaw<InsertedPopRow[]>`
    INSERT INTO "ProofOfPlayLog" (
      "id", "organizationId", "deviceId", "device", "content", "assetName",
      "playlistName", "campaignName", "status", "timestamp", "startTime",
      "endTime", "durationSeconds", "createdAt"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("organizationId", "deviceId", "assetName", "startTime") DO NOTHING
    RETURNING
      "organizationId", "deviceId", "device", "assetName", "playlistName",
      "campaignName", "status", "startTime", "durationSeconds"
  `;

  if (inserted.length) {
    await upsertHourlyAggregates(prisma, inserted);
  }

  await putCount('PopLogsConsumed', inserted.length);
  await putCount('PopLogsDuplicates', Math.max(0, message.logs.length - inserted.length));
  return { inserted: inserted.length };
}

async function ensurePartitionsForLogs(prisma: PrismaClient, logs: QueuedPopLog[]) {
  const days = [
    ...new Set(
      logs
        .map((log) => new Date(log.startTime))
        .filter((startTime) => !Number.isNaN(startTime.getTime()))
        .map((startTime) => startTime.toISOString().slice(0, 10)),
    ),
  ];
  try {
    for (const day of days) {
      await prisma.$executeRaw`SELECT orion_ensure_pop_partition(${day}::date)`;
    }
  } catch (error) {
    console.warn(
      'Could not ensure ProofOfPlayLog partitions; inserting anyway.',
      error instanceof Error ? error.message : error,
    );
  }
}

async function upsertHourlyAggregates(prisma: PrismaClient, rows: InsertedPopRow[]) {
  const buckets = new Map<string, {
    organizationId: string;
    hourStart: Date;
    deviceId: string;
    deviceName: string;
    assetName: string;
    playlistName: string;
    campaignName: string;
    verifiedCount: number;
    failedCount: number;
    durationSeconds: number;
    lastPlay: Date;
  }>();

  for (const row of rows) {
    const hourStart = hourStartUtc(row.startTime);
    const deviceId = row.deviceId ?? '';
    const playlistName = row.playlistName ?? '';
    const campaignName = row.campaignName ?? '';
    const key = [row.organizationId, hourStart.toISOString(), deviceId, row.assetName, playlistName, campaignName].join('|');
    const current = buckets.get(key) ?? {
      organizationId: row.organizationId,
      hourStart,
      deviceId,
      deviceName: row.device,
      assetName: row.assetName,
      playlistName,
      campaignName,
      verifiedCount: 0,
      failedCount: 0,
      durationSeconds: 0,
      lastPlay: row.startTime,
    };
    if (row.status === ProofOfPlayStatus.VERIFIED) {
      current.verifiedCount += 1;
      current.durationSeconds += row.durationSeconds ?? 0;
    } else {
      current.failedCount += 1;
    }
    if (row.startTime > current.lastPlay) current.lastPlay = row.startTime;
    buckets.set(key, current);
  }

  const values = [...buckets.values()].map((row) => Prisma.sql`(
    ${row.organizationId},
    ${row.hourStart},
    ${row.deviceId},
    ${row.deviceName},
    ${row.assetName},
    ${row.playlistName},
    ${row.campaignName},
    ${row.verifiedCount},
    ${row.failedCount},
    ${row.durationSeconds},
    ${row.lastPlay},
    NOW()
  )`);

  await prisma.$executeRaw`
    INSERT INTO "ProofOfPlayHourlyAggregate" (
      "organizationId", "hourStart", "deviceId", "deviceName", "assetName",
      "playlistName", "campaignName", "verifiedCount", "failedCount",
      "durationSeconds", "lastPlay", "updatedAt"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("organizationId", "hourStart", "deviceId", "assetName", "playlistName", "campaignName")
    DO UPDATE SET
      "verifiedCount" = "ProofOfPlayHourlyAggregate"."verifiedCount" + EXCLUDED."verifiedCount",
      "failedCount" = "ProofOfPlayHourlyAggregate"."failedCount" + EXCLUDED."failedCount",
      "durationSeconds" = "ProofOfPlayHourlyAggregate"."durationSeconds" + EXCLUDED."durationSeconds",
      "lastPlay" = GREATEST("ProofOfPlayHourlyAggregate"."lastPlay", EXCLUDED."lastPlay"),
      "deviceName" = EXCLUDED."deviceName",
      "updatedAt" = NOW()
  `;
}
