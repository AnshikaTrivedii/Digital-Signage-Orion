-- Device display configuration: stretch-to-fit for signage playback.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "stretchToFit" BOOLEAN NOT NULL DEFAULT false;
