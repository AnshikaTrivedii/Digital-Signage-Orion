-- CreateEnum
CREATE TYPE "TickerHeight" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable
ALTER TABLE "Ticker" ADD COLUMN "height" "TickerHeight" NOT NULL DEFAULT 'MEDIUM';
