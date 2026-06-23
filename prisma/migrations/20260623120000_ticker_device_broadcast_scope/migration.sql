-- CreateEnum
CREATE TYPE "TickerBroadcastScope" AS ENUM ('ALL_DEVICES', 'SELECTED_DEVICES');

-- AlterTable
ALTER TABLE "Ticker" ADD COLUMN "broadcastScope" "TickerBroadcastScope" NOT NULL DEFAULT 'ALL_DEVICES';

-- CreateTable
CREATE TABLE "TickerDevice" (
    "tickerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TickerDevice_pkey" PRIMARY KEY ("tickerId","deviceId")
);

-- CreateIndex
CREATE INDEX "TickerDevice_deviceId_idx" ON "TickerDevice"("deviceId");

-- AddForeignKey
ALTER TABLE "TickerDevice" ADD CONSTRAINT "TickerDevice_tickerId_fkey" FOREIGN KEY ("tickerId") REFERENCES "Ticker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TickerDevice" ADD CONSTRAINT "TickerDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
