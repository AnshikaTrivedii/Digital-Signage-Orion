-- Track which ticker revision the device last applied so unassign/delete
-- forces syncRequired even when playlist/layout version is unchanged.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "lastAckedTickerRevision" TEXT;
