CREATE TABLE "PlaylistAsset" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaylistAsset_playlistId_assetId_key" ON "PlaylistAsset"("playlistId", "assetId");
CREATE INDEX "PlaylistAsset_playlistId_position_idx" ON "PlaylistAsset"("playlistId", "position");

INSERT INTO "PlaylistAsset" ("id", "playlistId", "assetId", "position", "durationSeconds", "createdAt", "updatedAt")
SELECT
    'mig_' || substr(md5(pc."playlistId" || ':' || ca."assetId" || ':' || pc."position"::text || ':' || ca."position"::text), 1, 22),
    pc."playlistId",
    ca."assetId",
    (ROW_NUMBER() OVER (PARTITION BY pc."playlistId" ORDER BY pc."position", ca."position") - 1)::int,
    ca."durationSeconds",
    NOW(),
    NOW()
FROM "PlaylistCampaign" pc
JOIN "CampaignAsset" ca ON ca."campaignId" = pc."campaignId";

ALTER TABLE "PlaylistAsset" ADD CONSTRAINT "PlaylistAsset_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaylistAsset" ADD CONSTRAINT "PlaylistAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop campaign layer tables
DROP TABLE "PlaylistCampaign";
DROP TABLE "CampaignAsset";
DROP TABLE "Campaign";

-- Remove CAMPAIGNS from FeatureKey enum
DELETE FROM "MembershipFeaturePermission" WHERE "featureKey" = 'CAMPAIGNS';

CREATE TYPE "FeatureKey_new" AS ENUM ('DASHBOARD', 'ASSETS', 'PLAYLISTS', 'SCHEDULE', 'TICKERS', 'DEVICES', 'REPORTS', 'TEAM', 'SETTINGS');

ALTER TABLE "MembershipFeaturePermission" ALTER COLUMN "featureKey" TYPE "FeatureKey_new" USING ("featureKey"::text::"FeatureKey_new");

DROP TYPE "FeatureKey";
ALTER TYPE "FeatureKey_new" RENAME TO "FeatureKey";

DROP TYPE "CampaignStatus";
