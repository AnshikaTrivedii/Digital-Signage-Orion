-- Initial onboarding sync tracking for freshly paired devices
ALTER TABLE "Device" ADD COLUMN     "pendingInitialSync" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Device" ADD COLUMN     "initialSyncRequestedAt" TIMESTAMP(3);
