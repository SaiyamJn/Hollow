import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  parentTaskId: z.string().uuid().optional(),
  starred: z.boolean().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  done: z.boolean().optional(),
  starred: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

router.get("/", async (req: AuthedRequest, res) => {
  // Top-level tasks only; subtasks come nested so the client doesn't see duplicates.
  const tasks = await prisma.task.findMany({
    where: { ownerId: req.userId, parentTaskId: null },
    include: { subtasks: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
  });
  res.json(tasks);
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { title, description, dueAt, parentTaskId, starred } = parsed.data;

  if (parentTaskId) {
    const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
    if (!parent || parent.ownerId !== req.userId) return res.status(404).json({ error: "Parent task not found" });
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description?.trim() ?? "",
      ownerId: req.userId!,
      dueAt: dueAt ? new Date(dueAt) : null,
      parentTaskId: parentTaskId ?? null,
      starred: starred ?? false,
    },
    include: { subtasks: true },
  });
  res.status(201).json(task);
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task || task.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });

  const { title, description, done, starred, dueAt } = parsed.data;
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(done !== undefined ? { done } : {}),
      ...(starred !== undefined ? { starred } : {}),
      ...(dueAt !== undefined ? { dueAt: dueAt === null ? null : new Date(dueAt) } : {}),
    },
    include: { subtasks: { orderBy: { createdAt: "asc" } } },
  });
  res.json(updated);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task || task.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });
  await prisma.$transaction([
    prisma.task.deleteMany({ where: { parentTaskId: task.id } }),
    prisma.task.delete({ where: { id: task.id } }),
  ]);
  res.status(204).end();
});

export default router;
