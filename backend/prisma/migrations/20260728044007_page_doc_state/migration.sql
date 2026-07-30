-- CreateTable
CREATE TABLE "PageDocState" (
    "pageId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageDocState_pkey" PRIMARY KEY ("pageId")
);

-- AddForeignKey
ALTER TABLE "PageDocState" ADD CONSTRAINT "PageDocState_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
