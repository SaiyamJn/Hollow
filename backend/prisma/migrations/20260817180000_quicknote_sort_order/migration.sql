-- AlterTable
ALTER TABLE "QuickNote" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill from createdAt (seconds fit in INT4; ms do not and would overflow)
UPDATE "QuickNote" SET "sortOrder" = FLOOR(EXTRACT(EPOCH FROM "createdAt"))::integer
WHERE "sortOrder" = 0;
