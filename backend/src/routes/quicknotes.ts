import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { sealAtRest, unsealAtRest } from "../lib/encryption";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  content: z.string().min(1),
  color: z.string().optional(),
});

const patchSchema = z.object({
  content: z.string().min(1).optional(),
  color: z.string().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

function publicNote<T extends { content: string }>(note: T): T {
  return { ...note, content: unsealAtRest(note.content) };
}

router.get("/", async (req: AuthedRequest, res) => {
  const includeArchived = req.query.archived === "true";
  const notes = await prisma.quickNote.findMany({
    where: { ownerId: req.userId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  res.json(notes.map(publicNote));
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const note = await prisma.quickNote.create({
    data: {
      content: sealAtRest(parsed.data.content),
      color: parsed.data.color,
      ownerId: req.userId!,
    },
  });
  res.status(201).json(publicNote(note));
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const note = await prisma.quickNote.findUnique({ where: { id: req.params.id } });
  if (!note || note.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  const data = {
    ...parsed.data,
    ...(parsed.data.content !== undefined ? { content: sealAtRest(parsed.data.content) } : {}),
  };
  const updated = await prisma.quickNote.update({ where: { id: note.id }, data });
  res.json(publicNote(updated));
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const note = await prisma.quickNote.findUnique({ where: { id: req.params.id } });
  if (!note || note.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  await prisma.quickNote.delete({ where: { id: note.id } });
  res.status(204).end();
});

export default router;
