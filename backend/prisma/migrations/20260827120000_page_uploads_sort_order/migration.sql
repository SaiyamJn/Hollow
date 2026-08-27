-- Section + page manual ordering
ALTER TABLE "Section" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
UPDATE "Section" s
SET "sortOrder" = sub.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "notebookId" ORDER BY "createdAt" ASC) - 1)::integer AS rn
  FROM "Section"
) sub
WHERE s.id = sub.id AND s."sortOrder" = 0;

ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
UPDATE "Page" p
SET "sortOrder" = sub.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "sectionId" ORDER BY "createdAt" ASC) - 1)::integer AS rn
  FROM "Page"
) sub
WHERE p.id = sub.id AND p."sortOrder" = 0;

-- Embedded page uploads (BlockNote image/file blocks)
CREATE TABLE "PageUpload" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageUpload_pageId_idx" ON "PageUpload"("pageId");

ALTER TABLE "PageUpload" ADD CONSTRAINT "PageUpload_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
