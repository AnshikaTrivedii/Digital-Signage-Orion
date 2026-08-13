-- Track which schedule the device last applied so schedule start/end always
-- forces syncRequired, even when the effective playlistId is unchanged.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "lastAckedScheduleId" TEXT;
