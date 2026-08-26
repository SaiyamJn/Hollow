-- AlterTable
ALTER TABLE "Page" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Page_sectionId_deletedAt_idx" ON "Page"("sectionId", "deletedAt");
