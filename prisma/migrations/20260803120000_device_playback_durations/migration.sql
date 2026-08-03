-- Device-level default playback durations (seconds) for assets without playlist overrides.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "defaultImageDuration" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "defaultDocumentDuration" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "defaultUrlDuration" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "playbackSettingsUpdatedAt" TIMESTAMP(3);
