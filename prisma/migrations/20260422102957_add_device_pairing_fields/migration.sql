-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'DRAFT', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "PlaylistStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'WARNING');

-- CreateEnum
CREATE TYPE "TickerSpeed" AS ENUM ('SLOW', 'NORMAL', 'FAST');

-- CreateEnum
CREATE TYPE "TickerStyle" AS ENUM ('CLASSIC', 'NEON', 'GRADIENT', 'MINIMAL');

-- CreateEnum
CREATE TYPE "TickerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "TickerPriority" AS ENUM ('LOW', 'NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "SchedulePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "ProofOfPlayStatus" AS ENUM ('VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetCount" INTEGER NOT NULL DEFAULT 0,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "screens" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#4ade80',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PlaylistStatus" NOT NULL DEFAULT 'DRAFT',
    "screens" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#4ade80',
    "lastPlayedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistCampaign" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "days" TEXT[],
    "screens" INTEGER NOT NULL DEFAULT 0,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "color" TEXT NOT NULL DEFAULT '#4ade80',
    "priority" "SchedulePriority" NOT NULL DEFAULT 'NORMAL',
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "location" TEXT NOT NULL DEFAULT 'Pending',
    "ip" TEXT NOT NULL DEFAULT 'Pending',
    "resolution" TEXT NOT NULL DEFAULT '1920x1080',
    "uptime" TEXT NOT NULL DEFAULT '0s',
    "cpu" INTEGER NOT NULL DEFAULT 0,
    "ram" INTEGER NOT NULL DEFAULT 0,
    "temp" INTEGER NOT NULL DEFAULT 0,
    "lastSync" TEXT NOT NULL DEFAULT 'Awaiting first sync',
    "os" TEXT NOT NULL DEFAULT 'Unknown',
    "currentContent" TEXT,
    "currentPlaylistId" TEXT,
    "pairingCode" TEXT,
    "deviceToken" TEXT,
    "hardwareId" TEXT,
    "isPaired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticker" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "speed" "TickerSpeed" NOT NULL DEFAULT 'NORMAL',
    "style" "TickerStyle" NOT NULL DEFAULT 'NEON',
    "color" TEXT NOT NULL DEFAULT '#00e5ff',
    "status" "TickerStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "TickerPriority" NOT NULL DEFAULT 'NORMAL',
    "screens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofOfPlayLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ProofOfPlayStatus" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofOfPlayLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAsset" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_organizationId_createdAt_idx" ON "Campaign"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Playlist_organizationId_createdAt_idx" ON "Playlist"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PlaylistCampaign_campaignId_idx" ON "PlaylistCampaign"("campaignId");

-- CreateIndex
CREATE INDEX "PlaylistCampaign_playlistId_position_idx" ON "PlaylistCampaign"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistCampaign_playlistId_campaignId_key" ON "PlaylistCampaign"("playlistId", "campaignId");

-- CreateIndex
CREATE INDEX "PlaylistItem_playlistId_position_idx" ON "PlaylistItem"("playlistId", "position");

-- CreateIndex
CREATE INDEX "ScheduleEvent_organizationId_createdAt_idx" ON "ScheduleEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pairingCode_key" ON "Device"("pairingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceToken_key" ON "Device"("deviceToken");

-- CreateIndex
CREATE UNIQUE INDEX "Device_hardwareId_key" ON "Device"("hardwareId");

-- CreateIndex
CREATE INDEX "Device_organizationId_createdAt_idx" ON "Device"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Device_organizationId_currentPlaylistId_idx" ON "Device"("organizationId", "currentPlaylistId");

-- CreateIndex
CREATE INDEX "Ticker_organizationId_createdAt_idx" ON "Ticker"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ProofOfPlayLog_organizationId_timestamp_idx" ON "ProofOfPlayLog"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "CampaignAsset_campaignId_position_idx" ON "CampaignAsset"("campaignId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAsset_campaignId_assetId_key" ON "CampaignAsset"("campaignId", "assetId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistCampaign" ADD CONSTRAINT "PlaylistCampaign_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistCampaign" ADD CONSTRAINT "PlaylistCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_currentPlaylistId_fkey" FOREIGN KEY ("currentPlaylistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticker" ADD CONSTRAINT "Ticker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfPlayLog" ADD CONSTRAINT "ProofOfPlayLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAsset" ADD CONSTRAINT "CampaignAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAsset" ADD CONSTRAINT "CampaignAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
