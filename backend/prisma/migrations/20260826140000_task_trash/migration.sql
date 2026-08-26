-- AlterTable
ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_ownerId_deletedAt_idx" ON "Task"("ownerId", "deletedAt");
