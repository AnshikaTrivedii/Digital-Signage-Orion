-- CreateEnum
CREATE TYPE "DeviceLocationSource" AS ENUM ('DEVICE_GPS', 'ADMIN_ASSIGNED', 'GEOCODED', 'MANUAL');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "installLatitude" DOUBLE PRECISION,
ADD COLUMN     "installLongitude" DOUBLE PRECISION,
ADD COLUMN     "installAddress" TEXT,
ADD COLUMN     "installCity" TEXT,
ADD COLUMN     "installState" TEXT,
ADD COLUMN     "installCountry" TEXT,
ADD COLUMN     "installPostalCode" TEXT,
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "locationSource" "DeviceLocationSource",
ADD COLUMN     "locationAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "allowDeviceLocationUpdates" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastGpsLatitude" DOUBLE PRECISION,
ADD COLUMN     "lastGpsLongitude" DOUBLE PRECISION,
ADD COLUMN     "lastGpsAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "lastGpsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Device_organizationId_installLatitude_installLongitude_idx" ON "Device"("organizationId", "installLatitude", "installLongitude");
