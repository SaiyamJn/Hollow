import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { sealAtRest, unsealAtRest } from "../lib/encryption";
import {
  clampInterval,
  nextFutureDueAt,
  normalizeRepeatEnd,
  parseRepeatDays,
  serializeRepeatDays,
  withinRepeatBounds,
  type RepeatEnd,
  type RepeatRule,
} from "../lib/taskRepeat";
import { normalizeFocus, compareTaskPriority } from "../lib/taskFocus";
import { emitToUser } from "../sockets/collab";

const router = Router();
router.use(requireAuth);

const TRASH_MS = 7 * 24 * 60 * 60 * 1000;

/** Hard-delete tasks that have sat in the recycle bin longer than 7 days. */
export async function purgeExpiredTasks() {
  const cutoff = new Date(Date.now() - TRASH_MS);
  await prisma.task.deleteMany({
    where: { deletedAt: { not: null, lt: cutoff } },
  });
}

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");
const repeatRuleSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
const repeatDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .nullable()
  .optional();
const repeatEndSchema = z.enum(["never", "on", "after"]).nullable().optional();
const focusSchema = z.enum(["none", "critical", "steady", "swift", "quiet"]);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  group: z.string().max(50).optional(),
  dueAt: isoDate.optional(),
  parentTaskId: z.string().uuid().optional(),
  starred: z.boolean().optional(),
  focus: focusSchema.optional(),
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
  group: z.string().max(50).nullable().optional(),
  done: z.boolean().optional(),
  starred: z.boolean().optional(),
  focus: focusSchema.optional(),
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
    focus?: string | null;
    repeatDays?: string | null;
    repeatInterval?: number | null;
    repeatEnd?: string | null;
    repeatUntil?: Date | null;
    repeatCount?: number | null;
    subtasks?: Array<{
      title: string;
      description: string;
      focus?: string | null;
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
      focus?: string | null;
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
    focus: normalizeFocus(row.focus),
    repeatDays: parseRepeatDays(row.repeatDays ?? null),
    repeatInterval: clampInterval(row.repeatInterval ?? 1),
    repeatEnd: row.repeatEnd ? normalizeRepeatEnd(row.repeatEnd) : null,
    repeatUntil: row.repeatUntil ? row.repeatUntil.toISOString() : null,
    repeatCount: row.repeatCount ?? null,
    completedAt: (row as any).completedAt ? new Date((row as any).completedAt).toISOString() : null,
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
  await purgeExpiredTasks();
  const trashed = req.query.trashed === "true";

  const tasks = await prisma.task.findMany({
    where: {
      ownerId: req.userId,
      parentTaskId: null,
      ...(trashed
        ? { deletedAt: { not: null } }
        : {
            deletedAt: null,
            // Nested subtasks stay out of trash lists until restored with the parent.
          }),
    },
    include: {
      subtasks: {
        where: trashed ? undefined : { deletedAt: null },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: trashed
      ? [{ deletedAt: "desc" }]
      : [{ starred: "desc" }, { createdAt: "desc" }],
  });
  const publicList = tasks.map((t) => {
    const pub = publicTask(t);
    if (pub.subtasks) {
      pub.subtasks.sort(compareTaskPriority);
    }
    return pub;
  });
  if (!trashed) {
    publicList.sort(compareTaskPriority);
  }
  res.json(publicList);
});

async function getUserPreferences(userId: string): Promise<Record<string, any>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  if (!user?.preferences) return {};
  try {
    return JSON.parse(user.preferences);
  } catch {
    return {};
  }
}

async function saveUserPreferences(userId: string, prefs: Record<string, any>) {
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: JSON.stringify(prefs) },
  });
}

router.get("/classes", async (req: AuthedRequest, res) => {
  const prefs = await getUserPreferences(req.userId!);
  const taskGroups: string[] = Array.isArray(prefs.taskGroups) ? [...prefs.taskGroups] : [];
  const defaultClass: string = typeof prefs.defaultTaskGroup === "string" ? prefs.defaultTaskGroup : "";

  // Also discover distinct groups present in user's non-deleted tasks
  const tasks = await prisma.task.findMany({
    where: { ownerId: req.userId!, deletedAt: null, group: { not: "" } },
    select: { group: true },
    distinct: ["group"],
  });

  const set = new Set<string>(taskGroups);
  for (const t of tasks) {
    const g = (t.group || "").trim();
    if (g && !set.has(g)) {
      taskGroups.push(g);
      set.add(g);
    }
  }

  res.json({ classes: taskGroups, defaultClass });
});

router.put("/classes/order", async (req: AuthedRequest, res) => {
  const { classes, defaultClass } = req.body ?? {};
  if (!Array.isArray(classes)) {
    return res.status(400).json({ error: "classes must be an array of strings" });
  }
  const cleanClasses = classes.map((c: any) => String(c).trim()).filter(Boolean);
  const prefs = await getUserPreferences(req.userId!);
  prefs.taskGroups = cleanClasses;
  if (defaultClass !== undefined) {
    prefs.defaultTaskGroup = String(defaultClass).trim();
  }
  await saveUserPreferences(req.userId!, prefs);
  emitToUser(req.userId!, "tasks:changed", {
    action: "classes_reordered",
    classes: cleanClasses,
    defaultClass: prefs.defaultTaskGroup,
  });
  res.json({ ok: true, classes: cleanClasses, defaultClass: prefs.defaultTaskGroup || "" });
});

router.post("/classes/rename", async (req: AuthedRequest, res) => {
  const oldName = String(req.body?.oldName || "").trim();
  const newName = String(req.body?.newName || "").trim();
  if (!oldName || !newName) {
    return res.status(400).json({ error: "oldName and newName are required" });
  }
  if (oldName === newName) {
    return res.json({ ok: true, oldName, newName });
  }

  await prisma.task.updateMany({
    where: { ownerId: req.userId!, group: oldName },
    data: { group: newName },
  });

  const prefs = await getUserPreferences(req.userId!);
  if (Array.isArray(prefs.taskGroups)) {
    prefs.taskGroups = prefs.taskGroups.map((g: string) => (g === oldName ? newName : g));
    prefs.taskGroups = Array.from(new Set(prefs.taskGroups));
  }
  if (prefs.defaultTaskGroup === oldName) {
    prefs.defaultTaskGroup = newName;
  }
  await saveUserPreferences(req.userId!, prefs);

  emitToUser(req.userId!, "tasks:changed", { action: "class_renamed", oldName, newName });
  res.json({ ok: true, oldName, newName });
});

router.post("/classes/delete", async (req: AuthedRequest, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  await prisma.task.updateMany({
    where: { ownerId: req.userId!, group: name },
    data: { group: "" },
  });

  const prefs = await getUserPreferences(req.userId!);
  if (Array.isArray(prefs.taskGroups)) {
    prefs.taskGroups = prefs.taskGroups.filter((g: string) => g !== name);
  }
  if (prefs.defaultTaskGroup === name) {
    prefs.defaultTaskGroup = "";
  }
  await saveUserPreferences(req.userId!, prefs);

  emitToUser(req.userId!, "tasks:changed", { action: "class_deleted", name });
  res.json({ ok: true, name });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { subtasks: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!task || task.ownerId !== req.userId || task.deletedAt) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(publicTask(task));
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const {
    title,
    description,
    group,
    dueAt,
    parentTaskId,
    starred,
    focus,
    repeatRule,
    repeatDays,
    repeatInterval,
    repeatEnd,
    repeatUntil,
    repeatCount,
  } = parsed.data;

  if (parentTaskId) {
    const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
    if (!parent || parent.ownerId !== req.userId || parent.deletedAt) {
      return res.status(404).json({ error: "Parent task not found" });
    }
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
      group: (group ?? "").trim(),
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
      focus: normalizeFocus(focus),
      completedAt: null,
    },
    include: { subtasks: true },
  });
  const pub = publicTask(task);
  emitToUser(req.userId!, "tasks:changed", { action: "create", task: pub });
  res.status(201).json(pub);
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task || task.ownerId !== req.userId || task.deletedAt) return res.status(404).json({ error: "Not found" });

  const {
    title,
    description,
    group,
    done,
    starred,
    focus,
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
        ...(group !== undefined ? { group: (group ?? "").trim() } : {}),
        ...(done !== undefined ? { done, completedAt: done ? new Date() : null } : {}),
        ...(starred !== undefined ? { starred } : {}),
        ...(focus !== undefined ? { focus: normalizeFocus(focus) } : {}),
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
      include: { subtasks: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
    });

    if (markingDone && ruleForSpawn && dueForSpawn) {
      // Skip past occurrences so an overdue complete doesn't spawn another past due.
      const next = nextFutureDueAt(
        dueForSpawn,
        ruleForSpawn,
        daysForSpawn,
        intervalForSpawn,
        dueForSpawn
      );
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
            group: task.group,
            starred: task.starred,
            focus: normalizeFocus(task.focus),
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

  const pub = publicTask(updated);
  emitToUser(req.userId!, "tasks:changed", { action: "update", task: pub, patch: parsed.data });
  if (parsed.data.done !== undefined) {
    emitToUser(req.userId!, "tasks:done", { taskId: req.params.id, done: pub.done });
  }
  res.json(pub);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task || task.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });

  const permanent = req.query.permanent === "true";
  // Subtasks are lightweight — remove them for good. Parent tasks go to the bin.
  if (permanent || task.deletedAt || task.parentTaskId) {
    await prisma.$transaction([
      prisma.task.deleteMany({ where: { parentTaskId: task.id } }),
      prisma.task.delete({ where: { id: task.id } }),
    ]);
  } else {
    const now = new Date();
    await prisma.$transaction([
      prisma.task.updateMany({
        where: { parentTaskId: task.id, ownerId: req.userId, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.task.update({
        where: { id: task.id },
        data: { deletedAt: now },
      }),
    ]);
  }
  emitToUser(req.userId!, "tasks:changed", { action: "delete", taskId: req.params.id });
  emitToUser(req.userId!, "tasks:done", { taskId: req.params.id, done: true });
  res.status(204).end();
});

router.post("/:id/restore", async (req: AuthedRequest, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task || task.ownerId !== req.userId || !task.deletedAt) {
    return res.status(404).json({ error: "Not found" });
  }
  // Restoring a subtask alone is fine; restoring a parent also restores its children.
  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { deletedAt: null },
    }),
    prisma.task.updateMany({
      where: { parentTaskId: task.id, ownerId: req.userId },
      data: { deletedAt: null },
    }),
  ]);
  const restored = await prisma.task.findUnique({
    where: { id: task.id },
    include: { subtasks: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  const pub = publicTask(restored!);
  emitToUser(req.userId!, "tasks:changed", { action: "restore", task: pub });
  emitToUser(req.userId!, "tasks:done", { taskId: req.params.id, done: false });
  res.json(pub);
});

export default router;
