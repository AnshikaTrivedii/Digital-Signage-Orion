-- Scheduling module: time-bounded playlist assignments resolved at sync time.

-- Organization-level IANA zone used to interpret operator wall-clock input.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- A schedule can swap the effective playlist without changing syncVersion, so the
-- player sync check needs playlist identity, not just version.
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

ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_playlistId_fkey"
    FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The previous recurring-weekly schedule prototype had no playlist/device links and
-- never reached the player. It is replaced by "Schedule" above.
DROP TABLE IF EXISTS "ScheduleEvent";
DROP TYPE IF EXISTS "ScheduleStatus";
DROP TYPE IF EXISTS "SchedulePriority";
