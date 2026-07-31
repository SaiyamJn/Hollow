import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { deriveKey, encrypt, decrypt } from "../lib/encryption";
import { hasActiveDoc } from "../sockets/collab";

const router = Router();
router.use(requireAuth);

// Static paths must be registered before "/:id" or Express treats them as ids.

// Recently edited pages across every notebook the user owns.
router.get("/recent", async (req: AuthedRequest, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "8"), 10) || 8, 25);
  const pages = await prisma.page.findMany({
    where: { section: { notebook: { ownerId: req.userId! } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      createdAt: true,
      section: {
        select: {
          id: true,
          title: true,
          isLocked: true,
          notebookId: true,
          notebook: { select: { title: true, isLocked: true } },
        },
      },
    },
  });
  res.json(pages);
});

// Find-or-create today's daily note. The client sends its local date so the
// journal day boundary follows the user's timezone, not the server's.
router.post("/daily", async (req: AuthedRequest, res) => {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid date" });
  const { date } = parsed.data;

  let notebook = await prisma.notebook.findFirst({ where: { ownerId: req.userId!, title: "Journal" } });
  if (!notebook) {
    notebook = await prisma.notebook.create({ data: { title: "Journal", ownerId: req.userId! } });
  }
  let section = await prisma.section.findFirst({ where: { notebookId: notebook.id, title: "Daily notes" } });
  if (!section) {
    section = await prisma.section.create({ data: { title: "Daily notes", notebookId: notebook.id } });
  }

  let page = await prisma.page.findFirst({ where: { sectionId: section.id, title: date } });
  let created = false;
  if (!page) {
    if (section.isLocked) return res.status(423).json({ error: "Your daily notes section is locked" });
    page = await prisma.page.create({ data: { title: date, sectionId: section.id, content: "" } });
    created = true;
  }
  res.json({ id: page.id, title: page.title, sectionId: section.id, notebookId: notebook.id, created });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const page = await prisma.page.findUnique({ where: { id: req.params.id }, include: { section: true, tags: true } });
  if (!page) return res.status(404).json({ error: "Not found" });

  if (page.section.isLocked) {
    const password = req.header("x-section-password");
    if (!password || !page.section.salt) return res.status(423).json({ error: "Section is locked" });
    try {
      const key = deriveKey(password, page.section.salt);
      const content = decrypt(page.content, key);
      return res.json({ ...page, content });
    } catch {
      return res.status(401).json({ error: "Incorrect section password" });
    }
  }
  res.json(page);
});

/** Collect target page ids from `[[Title]]` text and /pages/:id hrefs in content. */
function resolveWikiTargets(
  content: string,
  sourcePageId: string,
  notebookPages: { id: string; title: string }[]
) {
  const byTitle = new Set(
    [...content.matchAll(/\[\[([^[\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase()).filter(Boolean)
  );
  const byId = new Set<string>();
  for (const m of content.matchAll(/\/pages\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)) {
    byId.add(m[1].toLowerCase());
  }
  return notebookPages
    .filter(
      (p) =>
        p.id !== sourcePageId &&
        (byId.has(p.id.toLowerCase()) || byTitle.has(p.title.trim().toLowerCase()))
    )
    .map((p) => p.id);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rewrite `[[Old Title]]` → `[[New Title]]` inside stored page content (JSON or plain). */
function rewriteWikiTitle(content: string, oldTitle: string, newTitle: string) {
  const re = new RegExp(`\\[\\[${escapeRegExp(oldTitle)}\\]\\]`, "gi");
  return content.replace(re, `[[${newTitle}]]`);
}

router.put("/:id", async (req: AuthedRequest, res) => {
  const { content } = z.object({ content: z.string() }).parse(req.body);
  const page = await prisma.page.findUnique({
    where: { id: req.params.id },
    include: { section: { include: { notebook: true } } },
  });
  if (!page || page.section.notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });

  let storedContent = content;
  if (page.section.isLocked) {
    const password = req.header("x-section-password");
    if (!password || !page.section.salt) return res.status(423).json({ error: "Section is locked" });
    const key = deriveKey(password, page.section.salt);
    storedContent = encrypt(content, key);
  }

  // Parse `[[Page Title]]` (+ clickable /pages/:id hrefs) from plaintext
  // content, resolve within this notebook, replace outgoing PageLink rows.
  const notebookPages = await prisma.page.findMany({
    where: { section: { notebookId: page.section.notebookId } },
    select: { id: true, title: true },
  });
  const targetIds = resolveWikiTargets(content, page.id, notebookPages);

  const [, , updated] = await prisma.$transaction([
    prisma.pageLink.deleteMany({ where: { sourcePageId: page.id } }),
    prisma.pageLink.createMany({ data: targetIds.map((targetPageId) => ({ sourcePageId: page.id, targetPageId })) }),
    prisma.page.update({ where: { id: req.params.id }, data: { content: storedContent } }),
  ]);

  // A REST write with no live collab session (e.g. from the mobile app, which
  // edits over plain REST) makes the content column the source of truth, so
  // drop any stale Yjs snapshot — the next web session re-seeds from content.
  // Web's own autosaves always happen while its collab doc is active, so this
  // never fires for them.
  if (!hasActiveDoc(page.id)) {
    await prisma.pageDocState.deleteMany({ where: { pageId: page.id } });
  }

  res.json({ ...updated, content });
});

// Backlinks: pages whose outgoing [[links]] target this page.
router.get("/:id/backlinks", async (req: AuthedRequest, res) => {
  const page = await prisma.page.findUnique({
    where: { id: req.params.id },
    include: { section: { include: { notebook: true } } },
  });
  if (!page || page.section.notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  const links = await prisma.pageLink.findMany({
    where: { targetPageId: page.id },
    include: { sourcePage: { select: { id: true, title: true, sectionId: true, updatedAt: true } } },
  });
  res.json(links.map((l) => l.sourcePage));
});

// Outgoing wiki-links from this page (what it points to).
router.get("/:id/outlinks", async (req: AuthedRequest, res) => {
  const page = await prisma.page.findUnique({
    where: { id: req.params.id },
    include: { section: { include: { notebook: true } } },
  });
  if (!page || page.section.notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  const links = await prisma.pageLink.findMany({
    where: { sourcePageId: page.id },
    include: { targetPage: { select: { id: true, title: true, sectionId: true, updatedAt: true } } },
  });
  res.json(links.map((l) => l.targetPage));
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = z.object({ title: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const page = await prisma.page.findUnique({
    where: { id: req.params.id },
    include: { section: { include: { notebook: true } } },
  });
  if (!page || page.section.notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });

  const oldTitle = page.title;
  const newTitle = parsed.data.title.trim();

  // Titles are never encrypted (only content is), so renaming works while locked.
  const updated = await prisma.page.update({
    where: { id: page.id },
    data: { title: newTitle },
    select: { id: true, title: true, sectionId: true, updatedAt: true },
  });

  // Keep [[links]] resolving after rename: rewrite wiki titles in other pages'
  // plaintext content. Locked pages stay encrypted — PageLink rows already use
  // ids so edges survive; text updates when those pages are next unlocked/saved.
  if (oldTitle !== newTitle) {
    const siblings = await prisma.page.findMany({
      where: {
        id: { not: page.id },
        section: { notebookId: page.section.notebookId, isLocked: false },
      },
      select: { id: true, content: true },
    });
    for (const sib of siblings) {
      if (!sib.content || !/\[\[/i.test(sib.content)) continue;
      const next = rewriteWikiTitle(sib.content, oldTitle, newTitle);
      if (next !== sib.content) {
        await prisma.page.update({ where: { id: sib.id }, data: { content: next } });
      }
    }
  }

  res.json(updated);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const page = await prisma.page.findUnique({
    where: { id: req.params.id },
    include: { section: { include: { notebook: true } } },
  });
  if (!page || page.section.notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  await prisma.$transaction([
    prisma.pageLink.deleteMany({ where: { OR: [{ sourcePageId: page.id }, { targetPageId: page.id }] } }),
    prisma.pageDocState.deleteMany({ where: { pageId: page.id } }),
    prisma.page.delete({ where: { id: page.id } }),
  ]);
  res.status(204).end();
});

export default router;
