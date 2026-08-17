import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { sealAtRest, unsealAtRest } from "../lib/encryption";
import {
  clampInterval,
  nextDueAt,
  normalizeRepeatEnd,
  parseRepeatDays,
  serializeRepeatDays,
  withinRepeatBounds,
  type RepeatEnd,
  type RepeatRule,
} from "../lib/taskRepeat";

const router = Router();
router.use(requireAuth);

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");
const repeatRuleSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
const repeatDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .nullable()
  .optional();
const repeatEndSchema = z.enum(["never", "on", "after"]).nullable().optional();

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: isoDate.optional(),
  parentTaskId: z.string().uuid().optional(),
  starred: z.boolean().optional(),
  repeatRule: repeatRuleSchema.nullable().optional(),
  repeatDays: repeatDaysSchema,
  repeatInterval: z.number().int().min(1).max(99).optional(),
  repeatEnd: repeatEndSchema,
  repeatUntil: isoDate.nullable().optional(),
  repeatCount: z.number().int().min(1).max(999).nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  done: z.boolean().optional(),
  starred: z.boolean().optional(),
  dueAt: isoDate.nullable().optional(),
  repeatRule: repeatRuleSchema.nullable().optional(),
  repeatDays: repeatDaysSchema,
  repeatInterval: z.number().int().min(1).max(99).optional(),
  repeatEnd: repeatEndSchema,
  repeatUntil: isoDate.nullable().optional(),
  repeatCount: z.number().int().min(1).max(999).nullable().optional(),
});

function publicTask<
  T extends {
    title: string;
    description: string;
    repeatDays?: string | null;
    repeatInterval?: number | null;
    repeatEnd?: string | null;
    repeatUntil?: Date | null;
    repeatCount?: number | null;
    subtasks?: Array<{
      title: string;
      description: string;
      repeatDays?: string | null;
      repeatInterval?: number | null;
      repeatEnd?: string | null;
      repeatUntil?: Date | null;
      repeatCount?: number | null;
    }>;
  },
>(task: T) {
  const mapRow = <
    U extends {
      repeatDays?: string | null;
      repeatInterval?: number | null;
      repeatEnd?: string | null;
      repeatUntil?: Date | null;
      repeatCount?: number | null;
    },
  >(
    row: U
  ) => ({
    ...row,
    repeatDays: parseRepeatDays(row.repeatDays ?? null),
    repeatInterval: clampInterval(row.repeatInterval ?? 1),
    repeatEnd: row.repeatEnd ? normalizeRepeatEnd(row.repeatEnd) : null,
    repeatUntil: row.repeatUntil ? row.repeatUntil.toISOString() : null,
    repeatCount: row.repeatCount ?? null,
  });
  return {
    ...mapRow(task),
    title: unsealAtRest(task.title),
    description: unsealAtRest(task.description ?? ""),
    ...(task.subtasks
      ? {
          subtasks: task.subtasks.map((s) => ({
            ...mapRow(s),
            title: unsealAtRest(s.title),
            description: unsealAtRest(s.description ?? ""),
          })),
        }
      : {}),
  };
}

function normalizeDays(rule: RepeatRule | null | undefined, days: number[] | null | undefined) {
  if (!rule || rule !== "weekly") return null;
  return serializeRepeatDays(days ?? null);
}

function normalizeEndFields(
  rule: RepeatRule | null,
  end: RepeatEnd | null | undefined,
  until: Date | null | undefined,
  count: number | null | undefined
) {
  if (!rule) {
    return { repeatEnd: null as string | null, repeatUntil: null as Date | null, repeatCount: null as number | null };
  }
  const e = normalizeRepeatEnd(end ?? null);
  if (e === "on") {
    return {
      repeatEnd: "on" as const,
      repeatUntil: until ?? null,
      repeatCount: null as number | null,
    };
  }
  if (e === "after") {
    return {
      repeatEnd: "after" as const,
      repeatUntil: null as Date | null,
      repeatCount: count && count > 0 ? Math.min(999, Math.floor(count)) : 30,
    };
  }
  return { repeatEnd: "never" as const, repeatUntil: null as Date | null, repeatCount: null as number | null };
}

router.get("/", async (req: AuthedRequest, res) => {
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
  const {
    title,
    description,
    dueAt,
    parentTaskId,
    starred,
    repeatRule,
    repeatDays,
    repeatInterval,
    repeatEnd,
    repeatUntil,
    repeatCount,
  } = parsed.data;

  if (parentTaskId) {
    const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
    if (!parent || parent.ownerId !== req.userId) return res.status(404).json({ error: "Parent task not found" });
  }

  const due = dueAt ? new Date(dueAt) : null;
  const rule = due && repeatRule ? repeatRule : null;
  const days = normalizeDays(rule, repeatDays);
  const interval = rule ? clampInterval(repeatInterval ?? 1) : 1;
  const ends = normalizeEndFields(
    rule,
    repeatEnd ?? null,
    repeatUntil ? new Date(repeatUntil) : null,
    repeatCount ?? null
  );

  const task = await prisma.task.create({
    data: {
      title: sealAtRest(title),
      description: sealAtRest(description?.trim() ?? ""),
      ownerId: req.userId!,
      dueAt: due,
      repeatRule: rule,
      repeatDays: days,
      repeatInterval: interval,
      repeatEnd: ends.repeatEnd,
      repeatUntil: ends.repeatUntil,
      repeatCount: ends.repeatCount,
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

  const {
    title,
    description,
    done,
    starred,
    dueAt,
    repeatRule,
    repeatDays,
    repeatInterval,
    repeatEnd,
    repeatUntil,
    repeatCount,
  } = parsed.data;

  const nextDue = dueAt === undefined ? undefined : dueAt === null ? null : new Date(dueAt);
  const effectiveDue = nextDue !== undefined ? nextDue : task.dueAt;

  let nextRule =
    repeatRule === undefined ? undefined : repeatRule === null || !effectiveDue ? null : repeatRule;
  if (nextDue === null) nextRule = null;

  const ruleForDays = (nextRule !== undefined ? nextRule : task.repeatRule) as RepeatRule | null;
  let nextDays: string | null | undefined = undefined;
  if (repeatDays !== undefined || nextRule !== undefined || nextDue === null) {
    if (!ruleForDays || ruleForDays !== "weekly" || nextDue === null) nextDays = null;
    else if (repeatDays !== undefined) nextDays = normalizeDays(ruleForDays, repeatDays);
    else if (nextRule !== undefined && nextRule !== "weekly") nextDays = null;
  }

  const intervalTouched =
    repeatInterval !== undefined || nextRule !== undefined || nextDue === null;
  const endTouched =
    repeatEnd !== undefined ||
    repeatUntil !== undefined ||
    repeatCount !== undefined ||
    nextRule !== undefined ||
    nextDue === null;

  let nextInterval: number | undefined = undefined;
  if (intervalTouched) {
    nextInterval = !ruleForDays || nextDue === null ? 1 : clampInterval(repeatInterval ?? task.repeatInterval ?? 1);
  }

  let nextEndFields:
    | { repeatEnd: string | null; repeatUntil: Date | null; repeatCount: number | null }
    | undefined;
  if (endTouched) {
    const endIn =
      repeatEnd !== undefined
        ? repeatEnd
        : task.repeatEnd
          ? normalizeRepeatEnd(task.repeatEnd)
          : "never";
    const untilIn =
      repeatUntil !== undefined
        ? repeatUntil
          ? new Date(repeatUntil)
          : null
        : task.repeatUntil;
    const countIn = repeatCount !== undefined ? repeatCount : task.repeatCount;
    nextEndFields = normalizeEndFields(ruleForDays, endIn, untilIn, countIn);
  }

  const markingDone = done === true && !task.done;
  const ruleForSpawn = ruleForDays;
  const dueForSpawn = effectiveDue;
  const daysForSpawn =
    nextDays !== undefined ? parseRepeatDays(nextDays) : parseRepeatDays(task.repeatDays);
  const intervalForSpawn = nextInterval ?? clampInterval(task.repeatInterval ?? 1);
  const endForSpawn = normalizeRepeatEnd(
    (nextEndFields?.repeatEnd ?? task.repeatEnd) as string | null
  );
  const untilForSpawn = nextEndFields ? nextEndFields.repeatUntil : task.repeatUntil;
  const countForSpawn = nextEndFields ? nextEndFields.repeatCount : task.repeatCount;

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
        ...(nextDays !== undefined ? { repeatDays: nextDays } : {}),
        ...(nextInterval !== undefined ? { repeatInterval: nextInterval } : {}),
        ...(nextEndFields
          ? {
              repeatEnd: nextEndFields.repeatEnd,
              repeatUntil: nextEndFields.repeatUntil,
              repeatCount: nextEndFields.repeatCount,
            }
          : {}),
      },
      include: { subtasks: { orderBy: { createdAt: "asc" } } },
    });

    if (markingDone && ruleForSpawn && dueForSpawn) {
      const next = nextDueAt(dueForSpawn, ruleForSpawn, daysForSpawn, intervalForSpawn, dueForSpawn);
      const remaining =
        endForSpawn === "after" && countForSpawn != null ? countForSpawn - 1 : countForSpawn;
      const ok = withinRepeatBounds(next, {
        end: endForSpawn,
        until: untilForSpawn,
        count: endForSpawn === "after" ? (countForSpawn ?? 0) : null,
        occurrenceIndex: 1, // next is the first *new* occurrence after current
      });
      // For "after": spawn only if remaining >= 1
      const afterOk = endForSpawn !== "after" || (remaining != null && remaining >= 1);
      if (ok && afterOk) {
        await tx.task.create({
          data: {
            title: task.title,
            description: task.description,
            starred: task.starred,
            dueAt: next,
            repeatRule: ruleForSpawn,
            repeatDays: ruleForSpawn === "weekly" ? serializeRepeatDays(daysForSpawn) : null,
            repeatInterval: intervalForSpawn,
            repeatEnd: endForSpawn,
            repeatUntil: endForSpawn === "on" ? untilForSpawn : null,
            repeatCount: endForSpawn === "after" ? remaining : null,
            ownerId: task.ownerId,
            parentTaskId: task.parentTaskId,
            done: false,
          },
        });
      }
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
