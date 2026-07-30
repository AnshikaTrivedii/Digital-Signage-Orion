#!/usr/bin/env node
/**
 * Proof-of-Play reporting diagnostic.
 *
 * Answers, against the database the API is actually pointed at:
 *   - do today's playback logs exist at all?
 *   - what playback timestamp vs. server insert time was recorded?
 *   - which date filters can reach each row, and why one cannot?
 *
 * Usage:
 *   node scripts/diagnose-pop-report.js [--tz Asia/Kolkata] [--device "pop test"]
 */
require('../apps/api/dist/load-env');
const { PrismaClient } = require('@prisma/client');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TZ = arg('tz', process.env.REPORT_TZ || 'Asia/Kolkata');
const DEVICE = arg('device', null);

const fmt = (d) =>
  d == null
    ? '—'
    : new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(d));

function zonedCalendar(instant, timeZone) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const pick = (t) => Number(p.find((x) => x.type === t).value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

function tzOffsetMs(instant, timeZone) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const pick = (t) => Number(p.find((x) => x.type === t).value);
  return (
    Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second')) -
    instant.getTime()
  );
}

function startOfDay(cal, timeZone) {
  const wall = Date.UTC(cal.year, cal.month - 1, cal.day, 0, 0, 0, 0);
  let ms = wall - tzOffsetMs(new Date(wall), timeZone);
  ms = wall - tzOffsetMs(new Date(ms), timeZone);
  return new Date(ms);
}

const addDays = (cal, n) => {
  const d = new Date(Date.UTC(cal.year, cal.month - 1, cal.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

const endOfDay = (cal, timeZone) => new Date(startOfDay(addDays(cal, 1), timeZone).getTime() - 1);

function ranges(now) {
  const today = zonedCalendar(now, TZ);
  return {
    today: [startOfDay(today, TZ), endOfDay(today, TZ)],
    yesterday: [startOfDay(addDays(today, -1), TZ), endOfDay(addDays(today, -1), TZ)],
    '7d': [startOfDay(addDays(today, -6), TZ), endOfDay(today, TZ)],
    '15d': [startOfDay(addDays(today, -14), TZ), endOfDay(today, TZ)],
  };
}

async function main() {
  const prisma = new PrismaClient();
  const now = new Date();
  const R = ranges(now);

  console.log('='.repeat(72));
  console.log(`PoP report diagnostic — timezone ${TZ}`);
  console.log(`server now: ${now.toISOString()} (UTC)  =  ${fmt(now)} (${TZ})`);
  console.log(`database:   ${(process.env.DATABASE_URL || '').replace(/:[^:@/]*@/, ':****@')}`);
  console.log('='.repeat(72));

  console.log('\n[1] Filter windows (UTC bounds applied to ProofOfPlayLog.startTime)');
  for (const [name, [a, b]] of Object.entries(R)) {
    console.log(`  ${name.padEnd(10)} ${a.toISOString()}  ..  ${b.toISOString()}`);
  }

  const total = await prisma.proofOfPlayLog.count();
  console.log(`\n[2] Total ProofOfPlayLog rows (all orgs): ${total}`);
  if (total === 0) {
    console.log('  No playback logs exist at all. The gap is upstream: player -> POST /api/player/pop-logs.');
    await prisma.$disconnect();
    return;
  }

  for (const [name, [a, b]] of Object.entries(R)) {
    const n = await prisma.proofOfPlayLog.count({ where: { startTime: { gte: a, lte: b } } });
    console.log(`  ${name.padEnd(10)} rows = ${n}`);
  }

  const ahead = await prisma.proofOfPlayLog.count({ where: { startTime: { gt: R.today[1] } } });
  console.log(`\n[3] Rows timestamped AFTER end of today (unreachable by every filter): ${ahead}`);
  if (ahead > 0) {
    const rows = await prisma.proofOfPlayLog.findMany({
      where: { startTime: { gt: R.today[1] } },
      orderBy: { startTime: 'desc' },
      take: 10,
      select: { device: true, assetName: true, startTime: true, createdAt: true },
    });
    console.log('  These drive "Last log" but can never appear in the table:');
    for (const r of rows) {
      const skewMin = Math.round((r.startTime.getTime() - r.createdAt.getTime()) / 60000);
      console.log(
        `   ${String(r.device).padEnd(18)} ${String(r.assetName).slice(0, 22).padEnd(24)} ` +
          `playback=${fmt(r.startTime)}  inserted=${fmt(r.createdAt)}  clock ahead by ~${skewMin} min`,
      );
    }
  }

  console.log('\n[4] Newest 15 rows (playback time vs. server insert time)');
  const latest = await prisma.proofOfPlayLog.findMany({
    orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
    take: 15,
    select: {
      device: true,
      deviceId: true,
      assetName: true,
      startTime: true,
      createdAt: true,
      organizationId: true,
    },
  });
  for (const r of latest) {
    const inToday = r.startTime >= R.today[0] && r.startTime <= R.today[1];
    console.log(
      `  ${inToday ? 'TODAY  ' : '       '} ${String(r.device).padEnd(18)} ` +
        `${String(r.assetName).slice(0, 22).padEnd(24)} playback=${fmt(r.startTime)}  inserted=${fmt(r.createdAt)}`,
    );
  }

  console.log('\n[5] Per-device activity today');
  const devices = await prisma.device.findMany({
    select: { id: true, name: true, organizationId: true, isPaired: true, featureProofOfPlay: true },
  });
  for (const d of devices) {
    if (DEVICE && !d.name.toLowerCase().includes(DEVICE.toLowerCase())) continue;
    const todayCount = await prisma.proofOfPlayLog.count({
      where: { deviceId: d.id, startTime: { gte: R.today[0], lte: R.today[1] } },
    });
    const allCount = await prisma.proofOfPlayLog.count({ where: { deviceId: d.id } });
    const newest = await prisma.proofOfPlayLog.findFirst({
      where: { deviceId: d.id },
      orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
      select: { startTime: true, createdAt: true },
    });
    console.log(
      `  ${d.name.padEnd(20)} paired=${String(d.isPaired).padEnd(5)} popEnabled=${String(d.featureProofOfPlay).padEnd(5)} ` +
        `org=${d.organizationId ?? 'NULL'} today=${String(todayCount).padEnd(5)} total=${String(allCount).padEnd(6)} ` +
        `newest=${fmt(newest?.startTime)} (inserted ${fmt(newest?.createdAt)})`,
    );
    if (!d.organizationId && allCount > 0) {
      console.log('     ^ device has no organization: it cannot submit new logs until re-paired.');
    }
  }

  console.log('\n[6] Rows whose organizationId does not match any organization');
  const orgIds = new Set((await prisma.organization.findMany({ select: { id: true } })).map((o) => o.id));
  const sample = await prisma.proofOfPlayLog.findMany({
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  const orphanOrgs = sample.map((s) => s.organizationId).filter((id) => !orgIds.has(id));
  console.log(orphanOrgs.length ? `  Orphaned organizationIds: ${orphanOrgs.join(', ')}` : '  None.');

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
