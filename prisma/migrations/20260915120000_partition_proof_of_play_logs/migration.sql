-- Convert ProofOfPlayLog to daily RANGE partitions and add hourly aggregates.
-- PostgreSQL requires unique/PK constraints on partitioned tables to include
-- the partition key (startTime). Raw events older than 30 days are dropped by
-- dropping whole partitions (see orion_drop_old_pop_partitions).

CREATE OR REPLACE FUNCTION orion_pop_partition_name(day date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT format('ProofOfPlayLog_p%s', to_char(day, 'YYYYMMDD'));
$$;

CREATE OR REPLACE FUNCTION orion_ensure_pop_partition(day date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  part_name text := orion_pop_partition_name(day);
  start_at timestamptz := day;
  end_at timestamptz := day + 1;
BEGIN
  IF to_regclass(format('public.%I', part_name)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public."ProofOfPlayLog" FOR VALUES FROM (%L) TO (%L)',
      part_name,
      start_at,
      end_at
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION orion_ensure_pop_partitions(days_ahead integer DEFAULT 14, days_behind integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  d date;
BEGIN
  d := (CURRENT_DATE - days_behind);
  WHILE d <= (CURRENT_DATE + days_ahead) LOOP
    PERFORM orion_ensure_pop_partition(d);
    d := d + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION orion_drop_old_pop_partitions(retain_days integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec record;
  part_day date;
  cutoff date := CURRENT_DATE - retain_days;
BEGIN
  FOR rec IN
    SELECT c.relname AS part_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'ProofOfPlayLog'
  LOOP
    IF rec.part_name ~ '^ProofOfPlayLog_p[0-9]{8}$' THEN
      part_day := to_date(substring(rec.part_name from '[0-9]{8}$'), 'YYYYMMDD');
      IF part_day < cutoff THEN
        EXECUTE format('DROP TABLE IF EXISTS public.%I', rec.part_name);
      END IF;
    END IF;
  END LOOP;

  DELETE FROM "ProofOfPlayHourlyAggregate"
  WHERE "hourStart" < (CURRENT_DATE - retain_days);
END;
$$;

ALTER TABLE "ProofOfPlayLog" RENAME TO "ProofOfPlayLog_unpartitioned";

ALTER TABLE "ProofOfPlayLog_unpartitioned" RENAME CONSTRAINT "ProofOfPlayLog_pkey" TO "ProofOfPlayLog_unpartitioned_pkey";
ALTER INDEX IF EXISTS "ProofOfPlayLog_natural_key" RENAME TO "ProofOfPlayLog_unpartitioned_natural_key";
ALTER INDEX IF EXISTS "ProofOfPlayLog_organizationId_timestamp_idx" RENAME TO "ProofOfPlayLog_unpartitioned_org_timestamp_idx";
ALTER INDEX IF EXISTS "ProofOfPlayLog_organizationId_startTime_idx" RENAME TO "ProofOfPlayLog_unpartitioned_org_startTime_idx";
ALTER INDEX IF EXISTS "ProofOfPlayLog_organizationId_deviceId_startTime_idx" RENAME TO "ProofOfPlayLog_unpartitioned_org_device_startTime_idx";
ALTER INDEX IF EXISTS "ProofOfPlayLog_org_startTime_id_idx" RENAME TO "ProofOfPlayLog_unpartitioned_org_startTime_id_idx";

ALTER TABLE "ProofOfPlayLog_unpartitioned" DROP CONSTRAINT IF EXISTS "ProofOfPlayLog_organizationId_fkey";
ALTER TABLE "ProofOfPlayLog_unpartitioned" DROP CONSTRAINT IF EXISTS "ProofOfPlayLog_deviceId_fkey";

CREATE TABLE "ProofOfPlayLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "device" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "assetName" TEXT NOT NULL DEFAULT '',
    "playlistName" TEXT,
    "campaignName" TEXT,
    "status" "ProofOfPlayStatus" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProofOfPlayLog_pkey" PRIMARY KEY ("id", "startTime")
) PARTITION BY RANGE ("startTime");

CREATE UNIQUE INDEX "ProofOfPlayLog_natural_key"
  ON "ProofOfPlayLog" ("organizationId", "deviceId", "assetName", "startTime");
CREATE INDEX "ProofOfPlayLog_organizationId_timestamp_idx"
  ON "ProofOfPlayLog" ("organizationId", "timestamp");
CREATE INDEX "ProofOfPlayLog_organizationId_startTime_idx"
  ON "ProofOfPlayLog" ("organizationId", "startTime");
CREATE INDEX "ProofOfPlayLog_organizationId_deviceId_startTime_idx"
  ON "ProofOfPlayLog" ("organizationId", "deviceId", "startTime");
CREATE INDEX "ProofOfPlayLog_org_startTime_id_idx"
  ON "ProofOfPlayLog" ("organizationId", "startTime" DESC, "id" DESC);

ALTER TABLE "ProofOfPlayLog"
  ADD CONSTRAINT "ProofOfPlayLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofOfPlayLog"
  ADD CONSTRAINT "ProofOfPlayLog_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProofOfPlayHourlyAggregate" (
    "organizationId" TEXT NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "playlistName" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastPlay" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProofOfPlayHourlyAggregate_pkey" PRIMARY KEY ("organizationId", "hourStart", "deviceId", "assetName", "playlistName", "campaignName")
);

CREATE INDEX "ProofOfPlayHourlyAggregate_organizationId_hourStart_idx"
  ON "ProofOfPlayHourlyAggregate" ("organizationId", "hourStart");
CREATE INDEX "ProofOfPlayHourlyAggregate_org_device_hour_idx"
  ON "ProofOfPlayHourlyAggregate" ("organizationId", "deviceId", "hourStart");

DO $$
DECLARE
  min_day date;
  max_day date;
  d date;
BEGIN
  SELECT
    COALESCE(MIN("startTime")::date, CURRENT_DATE) - 1,
    COALESCE(MAX("startTime")::date, CURRENT_DATE) + 14
  INTO min_day, max_day
  FROM "ProofOfPlayLog_unpartitioned";

  IF min_day > (CURRENT_DATE - 30) THEN
    min_day := CURRENT_DATE - 30;
  END IF;
  IF max_day < (CURRENT_DATE + 14) THEN
    max_day := CURRENT_DATE + 14;
  END IF;

  d := min_day;
  WHILE d <= max_day LOOP
    PERFORM orion_ensure_pop_partition(d);
    d := d + 1;
  END LOOP;
END $$;

INSERT INTO "ProofOfPlayLog" (
  "id", "organizationId", "deviceId", "device", "content", "assetName",
  "playlistName", "campaignName", "status", "timestamp", "startTime",
  "endTime", "durationSeconds", "createdAt"
)
SELECT
  "id", "organizationId", "deviceId", "device", "content", "assetName",
  "playlistName", "campaignName", "status", "timestamp", "startTime",
  "endTime", "durationSeconds", "createdAt"
FROM "ProofOfPlayLog_unpartitioned";

DROP TABLE "ProofOfPlayLog_unpartitioned";

INSERT INTO "ProofOfPlayHourlyAggregate" (
  "organizationId", "hourStart", "deviceId", "deviceName", "assetName",
  "playlistName", "campaignName", "verifiedCount", "failedCount",
  "durationSeconds", "lastPlay", "updatedAt"
)
SELECT
  "organizationId",
  date_trunc('hour', "startTime"),
  COALESCE("deviceId", ''),
  "device",
  "assetName",
  COALESCE("playlistName", ''),
  COALESCE("campaignName", ''),
  COUNT(*) FILTER (WHERE "status" = 'VERIFIED'),
  COUNT(*) FILTER (WHERE "status" = 'FAILED'),
  COALESCE(SUM("durationSeconds") FILTER (WHERE "status" = 'VERIFIED' AND "durationSeconds" IS NOT NULL), 0)::int,
  MAX("startTime"),
  NOW()
FROM "ProofOfPlayLog"
GROUP BY 1, 2, 3, 4, 5, 6, 7;
