-- CreateEnum
CREATE TYPE "DeviceSystemLogCategory" AS ENUM ('BOOT', 'CRASH', 'RESTART', 'SYNC', 'DOWNLOAD', 'PROOF_OF_PLAY', 'ERROR');

-- AlterEnum
ALTER TYPE "DeviceCacheCommandType" ADD VALUE 'RESTART_PLAYER';
ALTER TYPE "DeviceCacheCommandType" ADD VALUE 'RESTART_DEVICE';
ALTER TYPE "DeviceCacheCommandType" ADD VALUE 'UPLOAD_LOGS';
ALTER TYPE "DeviceCacheCommandType" ADD VALUE 'TAKE_SCREENSHOT';
ALTER TYPE "DeviceCacheCommandType" ADD VALUE 'REFRESH_STATUS';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "playerVersion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "androidVersion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "macAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deviceModel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "manufacturer" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "orientation" TEXT NOT NULL DEFAULT 'LANDSCAPE',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "storageTotalBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storageFreeBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "networkStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "wifiSignalStrength" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentAsset" TEXT,
ADD COLUMN     "currentPlaylistName" TEXT,
ADD COLUMN     "playbackStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "playbackUptimeSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastDownloadAt" TIMESTAMP(3),
ADD COLUMN     "permInternet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permStorage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permForegroundService" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permBootReceiver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permWakeLock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permNotification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permBatteryOptDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permAutoStart" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permKioskMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "brightness" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "volume" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "screenTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "featureAutoSync" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureOfflinePlayback" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureProofOfPlay" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureTicker" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureWatchdog" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureCrashRecovery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureBackgroundSync" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureAutoDownload" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featureRemoteLogs" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "configVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastScreenshotUrl" TEXT,
ADD COLUMN     "lastScreenshotAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeviceSystemLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "category" "DeviceSystemLogCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceSystemLog_deviceId_createdAt_idx" ON "DeviceSystemLog"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceSystemLog_deviceId_category_idx" ON "DeviceSystemLog"("deviceId", "category");

-- AddForeignKey
ALTER TABLE "DeviceSystemLog" ADD CONSTRAINT "DeviceSystemLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
