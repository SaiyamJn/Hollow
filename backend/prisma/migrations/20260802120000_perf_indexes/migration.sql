-- Hot-path indexes for owner filters, nested notebooks trees, and recent pages.
CREATE INDEX IF NOT EXISTS "Notebook_ownerId_idx" ON "Notebook"("ownerId");
CREATE INDEX IF NOT EXISTS "Section_notebookId_idx" ON "Section"("notebookId");
CREATE INDEX IF NOT EXISTS "Page_sectionId_idx" ON "Page"("sectionId");
CREATE INDEX IF NOT EXISTS "Page_updatedAt_idx" ON "Page"("updatedAt");
CREATE INDEX IF NOT EXISTS "PageLink_sourcePageId_idx" ON "PageLink"("sourcePageId");
CREATE INDEX IF NOT EXISTS "PageLink_targetPageId_idx" ON "PageLink"("targetPageId");
CREATE INDEX IF NOT EXISTS "QuickNote_ownerId_idx" ON "QuickNote"("ownerId");
CREATE INDEX IF NOT EXISTS "Task_ownerId_parentTaskId_idx" ON "Task"("ownerId", "parentTaskId");
