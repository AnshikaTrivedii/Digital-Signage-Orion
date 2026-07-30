-- Proof of Play audit integrity.
--
-- Until now duplicate playback rows could be stored (a device retrying a flush
-- re-inserted the same events) and were hidden again at read time, which made
-- the record count, the paginated table and the Excel export disagree.
-- Duplicates are now prevented at the source instead.

-- 1. Collapse existing duplicates, keeping the earliest stored row of each event.
DELETE FROM "ProofOfPlayLog" a
USING "ProofOfPlayLog" b
WHERE a."organizationId" = b."organizationId"
  AND a."deviceId" = b."deviceId"
  AND a."assetName" = b."assetName"
  AND a."startTime" = b."startTime"
  AND (a."createdAt", a."id") > (b."createdAt", b."id");

-- 2. Natural key of a playback event. Rows with a NULL deviceId are legacy /
--    unpaired-device rows; Postgres treats NULLs as distinct, so they are left
--    untouched rather than being collapsed together.
CREATE UNIQUE INDEX "ProofOfPlayLog_natural_key"
  ON "ProofOfPlayLog" ("organizationId", "deviceId", "assetName", "startTime");

-- 3. Total ordering used by the report table, keyset export and aggregate scan.
CREATE INDEX "ProofOfPlayLog_org_startTime_id_idx"
  ON "ProofOfPlayLog" ("organizationId", "startTime" DESC, "id" DESC);
