import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { generateSalt, deriveKey, encrypt } from "../lib/encryption";

const router = Router();
router.use(requireAuth);

const titleSchema = z.object({ title: z.string().min(1) });
const lockSchema = z.object({ password: z.string().min(4, "Password must be at least 4 characters") });
const unlockSchema = z.object({ password: z.string() });

// Locks one section: fresh salt, bcrypt hash for unlock verification, and
// every existing page's content encrypted with the PBKDF2-derived key.
// Shared with the notebook lock endpoint (locking a notebook = locking each
// of its sections with the same password).
export async function lockSectionWithPassword(sectionId: string, password: string) {
  const salt = generateSalt();
  const passwordHash = await bcrypt.hash(password, 12);
  const key = deriveKey(password, salt);
  const pages = await prisma.page.findMany({ where: { sectionId } });
  // Yjs collaboration snapshots hold the same page content, so they cross the
  // encryption boundary together with the content column.
  const docStates = await prisma.pageDocState.findMany({ where: { page: { sectionId } } });
  await prisma.$transaction([
    ...pages.map((p) =>
      prisma.page.update({ where: { id: p.id }, data: { content: encrypt(p.content, key) } })
    ),
    ...docStates.map((ds) =>
      prisma.pageDocState.update({ where: { pageId: ds.pageId }, data: { state: encrypt(ds.state, key) } })
    ),
    prisma.section.update({
      where: { id: sectionId },
      data: { isLocked: true, passwordHash, salt },
    }),
  ]);
}

async function getOwnedSection(sectionId: string, userId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { notebook: true },
  });
  if (!section || section.notebook.ownerId !== userId) return null;
  return section;
}

router.get("/notebooks/:notebookId/sections", async (req: AuthedRequest, res) => {
  const notebook = await prisma.notebook.findUnique({ where: { id: req.params.notebookId } });
  if (!notebook || notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  const sections = await prisma.section.findMany({
    where: { notebookId: notebook.id },
    include: { pages: { select: { id: true, title: true, updatedAt: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(sections);
});

router.post("/notebooks/:notebookId/sections", async (req: AuthedRequest, res) => {
  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const notebook = await prisma.notebook.findUnique({ where: { id: req.params.notebookId } });
  if (!notebook || notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  const section = await prisma.section.create({
    data: { title: parsed.data.title, notebookId: notebook.id },
  });
  res.status(201).json(section);
});

router.patch("/sections/:id", async (req: AuthedRequest, res) => {
  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const section = await getOwnedSection(req.params.id, req.userId!);
  if (!section) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.section.update({
    where: { id: section.id },
    data: { title: parsed.data.title },
  });
  res.json(updated);
});

router.delete("/sections/:id", async (req: AuthedRequest, res) => {
  const section = await getOwnedSection(req.params.id, req.userId!);
  if (!section) return res.status(404).json({ error: "Not found" });
  await prisma.$transaction([
    prisma.pageLink.deleteMany({
      where: { OR: [{ sourcePage: { sectionId: section.id } }, { targetPage: { sectionId: section.id } }] },
    }),
    prisma.pageDocState.deleteMany({ where: { page: { sectionId: section.id } } }),
    prisma.page.deleteMany({ where: { sectionId: section.id } }),
    prisma.section.delete({ where: { id: section.id } }),
  ]);
  res.status(204).end();
});

router.post("/sections/:id/lock", async (req: AuthedRequest, res) => {
  const parsed = lockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const section = await getOwnedSection(req.params.id, req.userId!);
  if (!section) return res.status(404).json({ error: "Not found" });
  if (section.isLocked) return res.status(409).json({ error: "Section is already locked" });
  await lockSectionWithPassword(section.id, parsed.data.password);
  res.json({ locked: true });
});

// Only verifies the password for UI purposes — content decryption always
// happens per-page with a freshly derived key (see routes/pages.ts).
router.post("/sections/:id/unlock", async (req: AuthedRequest, res) => {
  const parsed = unlockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const section = await getOwnedSection(req.params.id, req.userId!);
  if (!section) return res.status(404).json({ error: "Not found" });
  if (!section.isLocked || !section.passwordHash) return res.status(409).json({ error: "Section is not locked" });
  const ok = await bcrypt.compare(parsed.data.password, section.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect section password" });
  res.json({ unlocked: true });
});

router.post("/sections/:id/pages", async (req: AuthedRequest, res) => {
  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const section = await getOwnedSection(req.params.id, req.userId!);
  if (!section) return res.status(404).json({ error: "Not found" });

  let content = "";
  if (section.isLocked) {
    const password = req.header("x-section-password");
    if (!password || !section.salt || !section.passwordHash)
      return res.status(423).json({ error: "Section is locked" });
    const ok = await bcrypt.compare(password, section.passwordHash);
    if (!ok) return res.status(401).json({ error: "Incorrect section password" });
    content = encrypt("", deriveKey(password, section.salt));
  }

  const page = await prisma.page.create({
    data: { title: parsed.data.title, sectionId: section.id, content },
  });
  res.status(201).json({ ...page, content: "" });
});

export default router;
