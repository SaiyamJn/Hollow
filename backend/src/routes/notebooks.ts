import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { generateSalt } from "../lib/encryption";
import { lockSectionWithPassword } from "./sections";

const router = Router();
router.use(requireAuth);

const titleSchema = z.object({ title: z.string().min(1) });
const lockSchema = z.object({ password: z.string().min(4, "Password must be at least 4 characters") });
const unlockSchema = z.object({ password: z.string() });

async function getOwnedNotebook(notebookId: string, userId: string) {
  const notebook = await prisma.notebook.findUnique({ where: { id: notebookId } });
  if (!notebook || notebook.ownerId !== userId) return null;
  return notebook;
}

router.get("/", async (req: AuthedRequest, res) => {
  const notebooks = await prisma.notebook.findMany({
    where: { ownerId: req.userId },
    include: {
      sections: {
        include: { pages: { select: { id: true, title: true, updatedAt: true }, orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(notebooks);
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const notebook = await prisma.notebook.create({
    data: { title: parsed.data.title, ownerId: req.userId! },
  });
  res.status(201).json(notebook);
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const notebook = await getOwnedNotebook(req.params.id, req.userId!);
  if (!notebook) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.notebook.update({
    where: { id: notebook.id },
    data: { title: parsed.data.title },
  });
  res.json(updated);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const notebook = await getOwnedNotebook(req.params.id, req.userId!);
  if (!notebook) return res.status(404).json({ error: "Not found" });
  await prisma.$transaction([
    prisma.pageLink.deleteMany({
      where: {
        OR: [
          { sourcePage: { section: { notebookId: notebook.id } } },
          { targetPage: { section: { notebookId: notebook.id } } },
        ],
      },
    }),
    prisma.pageDocState.deleteMany({ where: { page: { section: { notebookId: notebook.id } } } }),
    prisma.page.deleteMany({ where: { section: { notebookId: notebook.id } } }),
    prisma.section.deleteMany({ where: { notebookId: notebook.id } }),
    prisma.notebook.delete({ where: { id: notebook.id } }),
  ]);
  res.status(204).end();
});

// Locking a notebook is a UI-level convenience: the notebook records its own
// hash/salt for the unlock prompt, and every not-yet-locked section inside is
// locked with the same password so the per-section encryption guarantee holds.
router.post("/:id/lock", async (req: AuthedRequest, res) => {
  const parsed = lockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const notebook = await getOwnedNotebook(req.params.id, req.userId!);
  if (!notebook) return res.status(404).json({ error: "Not found" });
  if (notebook.isLocked) return res.status(409).json({ error: "Notebook is already locked" });

  const { password } = parsed.data;
  const salt = generateSalt();
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.notebook.update({
    where: { id: notebook.id },
    data: { isLocked: true, passwordHash, salt },
  });

  const sections = await prisma.section.findMany({
    where: { notebookId: notebook.id, isLocked: false },
  });
  for (const section of sections) {
    await lockSectionWithPassword(section.id, password);
  }
  res.json({ locked: true });
});

// Graph view data: every page in the notebook as a node, every [[link]]
// between them as an edge.
router.get("/:id/graph", async (req: AuthedRequest, res) => {
  const notebook = await getOwnedNotebook(req.params.id, req.userId!);
  if (!notebook) return res.status(404).json({ error: "Not found" });
  const pages = await prisma.page.findMany({
    where: { section: { notebookId: notebook.id } },
    select: { id: true, title: true },
  });
  const links = await prisma.pageLink.findMany({
    where: { sourcePage: { section: { notebookId: notebook.id } } },
    select: { sourcePageId: true, targetPageId: true },
  });
  res.json({
    nodes: pages.map((p) => ({ id: p.id, title: p.title })),
    edges: links.map((l) => ({ source: l.sourcePageId, target: l.targetPageId })),
  });
});

// Only verifies the password for UI purposes — actual content decryption
// happens per-page (routes/pages.ts) with a freshly derived key, never a
// stored one.
router.post("/:id/unlock", async (req: AuthedRequest, res) => {
  const parsed = unlockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const notebook = await getOwnedNotebook(req.params.id, req.userId!);
  if (!notebook) return res.status(404).json({ error: "Not found" });
  if (!notebook.isLocked || !notebook.passwordHash) return res.status(409).json({ error: "Notebook is not locked" });
  const ok = await bcrypt.compare(parsed.data.password, notebook.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect notebook password" });
  res.json({ unlocked: true });
});

export default router;
