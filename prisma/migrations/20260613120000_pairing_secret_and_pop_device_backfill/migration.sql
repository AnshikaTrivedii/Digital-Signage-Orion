-- Device pairing secret (required to retrieve device token after CMS pair)
ALTER TABLE "Device" ADD COLUMN "pairingSecret" TEXT;

-- Backfill secrets for unpaired draft devices
UPDATE "Device"
SET "pairingSecret" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "pairingSecret" IS NULL AND "isPaired" = false;

-- Backfill deviceId on legacy proof-of-play rows (match by org + device name)
UPDATE "ProofOfPlayLog" pop
SET "deviceId" = d.id
FROM "Device" d
WHERE pop."deviceId" IS NULL
  AND pop."device" = d.name
  AND pop."organizationId" = d."organizationId";
