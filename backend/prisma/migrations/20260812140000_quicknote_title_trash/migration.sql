-- AlterTable
ALTER TABLE "QuickNote" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuickNote" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "QuickNote_ownerId_deletedAt_idx" ON "QuickNote"("ownerId", "deletedAt");
