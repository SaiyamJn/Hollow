import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { sealAtRest, unsealAtRest } from "../lib/encryption";

const router = Router();
router.use(requireAuth);

// Accept any parseable ISO string (toISOString() includes milliseconds; Zod's
// default .datetime() rejects those and left the UI stuck on "Adding…").
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

const repeatRuleSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: isoDate.optional(),
  parentTaskId: z.string().uuid().optional(),
  starred: z.boolean().optional(),
  repeatRule: repeatRuleSchema.nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  done: z.boolean().optional(),
  starred: z.boolean().optional(),
  dueAt: isoDate.nullable().optional(),
  repeatRule: repeatRuleSchema.nullable().optional(),
});

export type RepeatRule = z.infer<typeof repeatRuleSchema>;

/** Advance a due date by one recurrence step (local calendar math). */
export function nextDueAt(from: Date, rule: RepeatRule): Date {
  const next = new Date(from);
  switch (rule) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly": {
      const day = next.getDate();
      next.setMonth(next.getMonth() + 1);
      // Clamp overflow (e.g. Jan 31 → Feb 28/29)
      if (next.getDate() < day) next.setDate(0);
      break;
    }
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

function publicTask<T extends { title: string; description: string; subtasks?: Array<{ title: string; description: string }> }>(
  task: T
): T {
  return {
    ...task,
    title: unsealAtRest(task.title),
    description: unsealAtRest(task.description ?? ""),
    ...(task.subtasks
      ? {
          subtasks: task.subtasks.map((s) => ({
            ...s,
            title: unsealAtRest(s.title),
            description: unsealAtRest(s.description ?? ""),
          })),
        }
      : {}),
  };
}

router.get("/", async (req: AuthedRequest, res) => {
  // Top-level tasks only; subtasks come nested so the client doesn't see duplicates.
  const tasks = await prisma.task.findMany({
    where: { ownerId: req.userId, parentTaskId: null },
    include: { subtasks: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
  });
  res.json(tasks.map(publicTask));
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { title, description, dueAt, parentTaskId, starred, repeatRule } = parsed.data;

  if (parentTaskId) {
    const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
    if (!parent || parent.ownerId !== req.userId) return res.status(404).json({ error: "Parent task not found" });
  }

  const due = dueAt ? new Date(dueAt) : null;
  // Recurrence requires a due date.
  const rule = due && repeatRule ? repeatRule : null;

  const task = await prisma.task.create({
    data: {
      title: sealAtRest(title),
      description: sealAtRest(description?.trim() ?? ""),
      ownerId: req.userId!,
      dueAt: due,
      repeatRule: rule,
      parentTaskId: parentTaskId ?? null,
      starred: starred ?? false,
    },
    include: { subtasks: true },
  });
  res.status(201).json(publicTask(task));
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task || task.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });

  const { title, description, done, starred, dueAt, repeatRule } = parsed.data;

  const nextDue =
    dueAt === undefined ? undefined : dueAt === null ? null : new Date(dueAt);
  const effectiveDue = nextDue !== undefined ? nextDue : task.dueAt;

  let nextRule =
    repeatRule === undefined ? undefined : repeatRule === null || !effectiveDue ? null : repeatRule;
  // Clearing the due date always clears recurrence.
  if (nextDue === null) nextRule = null;

  const markingDone = done === true && !task.done;
  const ruleForSpawn =
    (nextRule !== undefined ? nextRule : task.repeatRule) as RepeatRule | null;
  const dueForSpawn = effectiveDue;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.task.update({
      where: { id: task.id },
      data: {
        ...(title !== undefined ? { title: sealAtRest(title) } : {}),
        ...(description !== undefined ? { description: sealAtRest(description) } : {}),
        ...(done !== undefined ? { done } : {}),
        ...(starred !== undefined ? { starred } : {}),
        ...(nextDue !== undefined ? { dueAt: nextDue } : {}),
        ...(nextRule !== undefined ? { repeatRule: nextRule } : {}),
      },
      include: { subtasks: { orderBy: { createdAt: "asc" } } },
    });

    // Completing a recurring task spawns the next incomplete occurrence.
    if (markingDone && ruleForSpawn && dueForSpawn) {
      await tx.task.create({
        data: {
          title: task.title,
          description: task.description,
          starred: task.starred,
          dueAt: nextDueAt(dueForSpawn, ruleForSpawn),
          repeatRule: ruleForSpawn,
          ownerId: task.ownerId,
          parentTaskId: task.parentTaskId,
          done: false,
        },
      });
    }

    return row;
  });

  res.json(publicTask(updated));
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
