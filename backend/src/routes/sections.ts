import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { generateSalt, deriveKey, encrypt, unsealAtRest, sealAtRest } from "../lib/encryption";
import { publicSection } from "../lib/sanitize";

const router = Router();
router.use(requireAuth);

const titleSchema = z.object({ title: z.string().min(1) });
const lockSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
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
      prisma.page.update({
        where: { id: p.id },
        // Unseal server-at-rest ciphertext first so we vault-encrypt plaintext.
        data: { content: encrypt(unsealAtRest(p.content), key) },
      })
    ),
    ...docStates.map((ds) =>
      prisma.pageDocState.update({
        where: { pageId: ds.pageId },
        data: { state: encrypt(unsealAtRest(ds.state), key) },
      })
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

router.post("/notebooks/:notebookId/sections", async (req: AuthedRequest, res) => {
  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const notebook = await prisma.notebook.findUnique({ where: { id: req.params.notebookId } });
  if (!notebook || notebook.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });

  // Locked notebooks: new sections must be vault-encrypted with the same password.
  if (notebook.isLocked) {
    const password = req.header("x-section-password");
    if (!password || !notebook.passwordHash)
      return res.status(423).json({ error: "Notebook is locked — password required to add a section" });
    const ok = await bcrypt.compare(password, notebook.passwordHash);
    if (!ok) return res.status(401).json({ error: "Incorrect notebook password" });

    const section = await prisma.section.create({
      data: { title: parsed.data.title, notebookId: notebook.id },
    });
    await lockSectionWithPassword(section.id, password);
    const locked = await prisma.section.findUnique({
      where: { id: section.id },
      include: { pages: { select: { id: true, title: true, updatedAt: true } } },
    });
    return res.status(201).json(publicSection(locked!));
  }

  const section = await prisma.section.create({
    data: { title: parsed.data.title, notebookId: notebook.id },
  });
  res.status(201).json(publicSection(section));
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
  res.json(publicSection(updated));
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

  let content = sealAtRest("");
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
  res.status(201).json({ id: page.id, title: page.title, sectionId: page.sectionId, updatedAt: page.updatedAt, content: "" });
});

export default router;
