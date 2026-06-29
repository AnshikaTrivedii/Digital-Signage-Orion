-- CreateEnum
CREATE TYPE "DeviceCacheDownloadStatus" AS ENUM ('DOWNLOADED', 'PENDING', 'FAILED');
CREATE TYPE "DeviceCacheLocalStatus" AS ENUM ('PRESENT', 'MISSING', 'CORRUPT');
CREATE TYPE "DeviceSyncReportStatus" AS ENUM ('OK', 'PARTIAL', 'FAILED');
CREATE TYPE "DeviceCacheCommandType" AS ENUM ('FORCE_SYNC', 'CLEAR_CACHE', 'REDOWNLOAD_PLAYLIST');
CREATE TYPE "DeviceCacheCommandStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "cachePlaylistName" TEXT,
ADD COLUMN "cachePlaylistVersion" INTEGER,
ADD COLUMN "cacheLayoutName" TEXT,
ADD COLUMN "cacheLayoutVersion" INTEGER,
ADD COLUMN "cacheTotalBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cacheUsedBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cacheStorageTotalBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cachedAssetCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "expectedAssetCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pendingDownloadCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cacheLastReportedAt" TIMESTAMP(3),
ADD COLUMN "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN "lastFailedSyncAt" TIMESTAMP(3),
ADD COLUMN "lastSyncError" TEXT,
ADD COLUMN "syncReportStatus" "DeviceSyncReportStatus";

-- CreateTable
CREATE TABLE "DeviceCachedAsset" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "playlistId" TEXT,
    "playlistName" TEXT,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "assetVersion" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT,
    "downloadStatus" "DeviceCacheDownloadStatus" NOT NULL DEFAULT 'PENDING',
    "localCacheStatus" "DeviceCacheLocalStatus" NOT NULL DEFAULT 'MISSING',
    "downloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCachedAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceCacheCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "command" "DeviceCacheCommandType" NOT NULL,
    "status" "DeviceCacheCommandStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCacheCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCachedAsset_deviceId_assetId_key" ON "DeviceCachedAsset"("deviceId", "assetId");
CREATE INDEX "DeviceCachedAsset_deviceId_idx" ON "DeviceCachedAsset"("deviceId");
CREATE INDEX "DeviceCacheCommand_deviceId_status_idx" ON "DeviceCacheCommand"("deviceId", "status");

-- AddForeignKey
ALTER TABLE "DeviceCachedAsset" ADD CONSTRAINT "DeviceCachedAsset_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceCachedAsset" ADD CONSTRAINT "DeviceCachedAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceCacheCommand" ADD CONSTRAINT "DeviceCacheCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceCacheCommand" ADD CONSTRAINT "DeviceCacheCommand_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
