CREATE TYPE "PlayerReleaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "DeviceAppUpdateState" AS ENUM ('AVAILABLE', 'DOWNLOADING', 'VERIFIED', 'INSTALLING', 'HEALTHY', 'FAILED', 'BLOCKED');

ALTER TABLE "Device" ADD COLUMN "playerVersionCode" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deviceOwner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "silentUpdateCapable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PlayerRelease" (
  "id" TEXT NOT NULL,
  "versionCode" INTEGER,
  "versionName" TEXT,
  "apkKey" TEXT NOT NULL,
  "sizeBytes" INTEGER,
  "sha256" TEXT,
  "signingCertSha256" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "status" "PlayerReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerRelease_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DeviceAppUpdate" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "state" "DeviceAppUpdateState" NOT NULL DEFAULT 'AVAILABLE',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceAppUpdate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerRelease_versionCode_key" ON "PlayerRelease"("versionCode");
CREATE UNIQUE INDEX "PlayerRelease_apkKey_key" ON "PlayerRelease"("apkKey");
CREATE INDEX "PlayerRelease_status_versionCode_idx" ON "PlayerRelease"("status", "versionCode");
CREATE UNIQUE INDEX "DeviceAppUpdate_deviceId_releaseId_key" ON "DeviceAppUpdate"("deviceId", "releaseId");
CREATE INDEX "DeviceAppUpdate_releaseId_state_idx" ON "DeviceAppUpdate"("releaseId", "state");
CREATE UNIQUE INDEX "PlayerRelease_one_active_idx" ON "PlayerRelease"("status") WHERE "status" = 'ACTIVE';
ALTER TABLE "PlayerRelease" ADD CONSTRAINT "PlayerRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeviceAppUpdate" ADD CONSTRAINT "DeviceAppUpdate_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceAppUpdate" ADD CONSTRAINT "DeviceAppUpdate_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "PlayerRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
