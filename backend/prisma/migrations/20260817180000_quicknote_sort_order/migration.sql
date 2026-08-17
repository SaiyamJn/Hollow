-- AlterTable
ALTER TABLE "QuickNote" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill from createdAt so existing newest-first order is preserved (desc sortOrder)
UPDATE "QuickNote" SET "sortOrder" = (EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint;
