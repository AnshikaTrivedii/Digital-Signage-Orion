-- CreateEnum
CREATE TYPE "LayoutStatus" AS ENUM ('DRAFT', 'ACTIVE');
CREATE TYPE "LayoutResolution" AS ENUM ('LANDSCAPE_1080P', 'LANDSCAPE_4K', 'PORTRAIT');
CREATE TYPE "ZoneType" AS ENUM ('PLAYLIST', 'TICKER', 'IMAGE', 'HTML', 'CLOCK');

-- CreateTable
CREATE TABLE "Layout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "LayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "resolution" "LayoutResolution" NOT NULL DEFAULT 'LANDSCAPE_1080P',
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "screens" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#a78bfa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayoutZone" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ZoneType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#00e5ff',
    "playlistId" TEXT,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LayoutZone_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "currentLayoutId" TEXT;
ALTER TABLE "Device" ADD COLUMN "lastAckedLayoutVersion" INTEGER;

-- CreateIndex
CREATE INDEX "Layout_organizationId_updatedAt_idx" ON "Layout"("organizationId", "updatedAt");
CREATE INDEX "LayoutZone_layoutId_zIndex_idx" ON "LayoutZone"("layoutId", "zIndex");
CREATE INDEX "Device_organizationId_currentLayoutId_idx" ON "Device"("organizationId", "currentLayoutId");

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LayoutZone" ADD CONSTRAINT "LayoutZone_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LayoutZone" ADD CONSTRAINT "LayoutZone_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LayoutZone" ADD CONSTRAINT "LayoutZone_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_currentLayoutId_fkey" FOREIGN KEY ("currentLayoutId") REFERENCES "Layout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
