-- Blank duration = no playlist override (use device default playback duration).
ALTER TABLE "PlaylistAsset" ALTER COLUMN "durationSeconds" DROP DEFAULT;
ALTER TABLE "PlaylistAsset" ALTER COLUMN "durationSeconds" DROP NOT NULL;
