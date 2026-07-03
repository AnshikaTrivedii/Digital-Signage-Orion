-- AlterTable: device storage fields exceed Int32 on modern Android signage hardware
ALTER TABLE "Device" ALTER COLUMN "storageTotalBytes" SET DATA TYPE BIGINT USING "storageTotalBytes"::bigint;
ALTER TABLE "Device" ALTER COLUMN "storageFreeBytes" SET DATA TYPE BIGINT USING "storageFreeBytes"::bigint;
