-- Allow the same asset to appear multiple times in one playlist.
-- Each PlaylistAsset row is a distinct occurrence with its own id, position, and duration.

DROP INDEX IF EXISTS "PlaylistAsset_playlistId_assetId_key";

CREATE INDEX IF NOT EXISTS "PlaylistAsset_playlistId_assetId_idx" ON "PlaylistAsset"("playlistId", "assetId");
