-- AlterTable
ALTER TABLE "ScheduleEvent" ADD COLUMN "playlistId" TEXT;
ALTER TABLE "ScheduleEvent" ADD COLUMN "broadcastScope" "TickerBroadcastScope" NOT NULL DEFAULT 'ALL_DEVICES';

-- CreateTable
CREATE TABLE "ScheduleEventDevice" (
    "scheduleEventId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleEventDevice_pkey" PRIMARY KEY ("scheduleEventId","deviceId")
);

-- CreateIndex
CREATE INDEX "ScheduleEvent_organizationId_playlistId_idx" ON "ScheduleEvent"("organizationId", "playlistId");

-- CreateIndex
CREATE INDEX "ScheduleEventDevice_deviceId_idx" ON "ScheduleEventDevice"("deviceId");

-- AddForeignKey
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEventDevice" ADD CONSTRAINT "ScheduleEventDevice_scheduleEventId_fkey" FOREIGN KEY ("scheduleEventId") REFERENCES "ScheduleEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEventDevice" ADD CONSTRAINT "ScheduleEventDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
