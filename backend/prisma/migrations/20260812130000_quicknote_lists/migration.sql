-- AlterTable
ALTER TABLE "QuickNote" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'note';
ALTER TABLE "QuickNote" ADD COLUMN "items" TEXT;
