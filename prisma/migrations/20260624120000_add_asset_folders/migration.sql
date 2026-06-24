-- CreateTable
CREATE TABLE "AssetFolder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetFolder_organizationId_idx" ON "AssetFolder"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetFolder_organizationId_parentId_name_key" ON "AssetFolder"("organizationId", "parentId", "name");

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE INDEX "Asset_organizationId_folderId_idx" ON "Asset"("organizationId", "folderId");

-- AddForeignKey
ALTER TABLE "AssetFolder" ADD CONSTRAINT "AssetFolder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFolder" ADD CONSTRAINT "AssetFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AssetFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
