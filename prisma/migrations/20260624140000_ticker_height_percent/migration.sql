-- Replace fixed ticker height enum with screen-height percentage (10–20%).
ALTER TABLE "Ticker" ADD COLUMN "heightPercent" INTEGER NOT NULL DEFAULT 10;

UPDATE "Ticker"
SET "heightPercent" = CASE
  WHEN "height" = 'LARGE' THEN 20
  WHEN "height" = 'SMALL' THEN 10
  ELSE 10
END;

ALTER TABLE "Ticker" DROP COLUMN "height";
DROP TYPE "TickerHeight";
