-- Supabase SQL Editor recovery for P3009 on 20260811160000_scheduling_module
--
-- Run this entire file in Supabase → SQL Editor (uses direct connection).
-- Then redeploy Render with:
--   Start Command: bash scripts/start-api.sh
--   DIRECT_URL:    db.<ref>.supabase.co connection string

-- 1. Remove the failed migration record blocking deploy
DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260811160000_scheduling_module';

-- 2. Apply scheduling schema (idempotent — safe if partially applied)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "lastAckedPlaylistId" TEXT;

CREATE TABLE IF NOT EXISTS "Schedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "deviceId" TEXT,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Schedule_organizationId_startDateTime_idx" ON "Schedule"("organizationId", "startDateTime");
CREATE INDEX IF NOT EXISTS "Schedule_organizationId_deviceId_enabled_idx" ON "Schedule"("organizationId", "deviceId", "enabled");
CREATE INDEX IF NOT EXISTS "Schedule_playlistId_idx" ON "Schedule"("playlistId");

DO $$ BEGIN
    ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_playlistId_fkey"
        FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_deviceId_fkey"
        FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TABLE IF EXISTS "ScheduleEvent" CASCADE;
DROP TYPE IF EXISTS "ScheduleStatus";
DROP TYPE IF EXISTS "SchedulePriority";

-- After this, redeploy. migrate deploy will record the migration with the correct checksum.
