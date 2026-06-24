-- Align Asset.fileSize with the schema default (no behavioural change; the
-- application already supplies fileSize on every insert).
ALTER TABLE "Asset" ALTER COLUMN "fileSize" SET DEFAULT 0;
