-- Playlist sync versioning for offline-first player incremental sync
ALTER TABLE "Playlist" ADD COLUMN "syncVersion" INTEGER NOT NULL DEFAULT 1;

-- Asset content versioning and checksum for delta downloads
ALTER TABLE "Asset" ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN "contentHash" TEXT;

-- Track last playlist version acknowledged by a device
ALTER TABLE "Device" ADD COLUMN "lastAckedPlaylistVersion" INTEGER;
