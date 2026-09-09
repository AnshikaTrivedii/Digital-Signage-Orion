-- Per-organization device allowance. NULL means unlimited, so existing
-- organizations keep their current unrestricted behaviour.
--
-- Idempotent so a retry after a failed/partial apply can complete safely.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "deviceLimit" INTEGER;
