-- CreateEnum
CREATE TYPE "TickerPosition" AS ENUM ('TOP', 'BOTTOM');

-- AlterTable
ALTER TABLE "Ticker" ADD COLUMN "backgroundColor" TEXT NOT NULL DEFAULT '#1a1f2e';
ALTER TABLE "Ticker" ADD COLUMN "position" "TickerPosition" NOT NULL DEFAULT 'BOTTOM';

-- CreateIndex
CREATE INDEX "Ticker_organizationId_status_idx" ON "Ticker"("organizationId", "status");
