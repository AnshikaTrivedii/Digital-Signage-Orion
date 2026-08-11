-- Device-level default video duration, applied only when a playlist slot leaves durationSeconds NULL.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "defaultVideoDuration" INTEGER NOT NULL DEFAULT 10;
