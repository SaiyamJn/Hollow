import { Router, Response, NextFunction, Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const router = Router();

function adminConfigured() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  return Boolean(email && password.length >= 8);
}

function timingSafeStringEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function signAdminToken(email: string): string {
  return jwt.sign({ role: "admin", email }, process.env.JWT_SECRET!, { expiresIn: "12h" });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Separate from user accounts — credentials come only from env. */
router.post("/login", async (req, res) => {
  if (!adminConfigured()) {
    return res.status(403).json({ error: "Admin access is not configured" });
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid email or password" });

  const expectEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const expectPassword = process.env.ADMIN_PASSWORD!;
  const emailOk = timingSafeStringEqual(parsed.data.email.trim().toLowerCase(), expectEmail);
  const passOk = timingSafeStringEqual(parsed.data.password, expectPassword);
  if (!emailOk || !passOk) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.json({
    token: signAdminToken(expectEmail),
    email: expectEmail,
  });
});

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!adminConfigured()) {
    return res.status(403).json({ error: "Admin access is not configured" });
  }
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as {
      role?: string;
      email?: string;
    };
    if (payload.role !== "admin" || !payload.email) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

router.use(requireAdmin);

// Aggregate stats + per-user details. Never returns note contents or titles.
router.get("/stats", async (_req: Request, res) => {
  const [userCount, notebookCount, sectionCount, pageCount, quickNoteCount, taskCount, linkCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.notebook.count(),
      prisma.section.count(),
      prisma.page.count(),
      prisma.quickNote.count(),
      prisma.task.count(),
      prisma.pageLink.count(),
    ]);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      createdAt: true,
      _count: { select: { notebooks: true, quickNotes: true, tasks: true } },
    },
  });

  const byteRows = await prisma.$queryRaw<{ ownerId: string; bytes: bigint }[]>`
    SELECT n."ownerId" AS "ownerId", COALESCE(SUM(LENGTH(p."content")), 0)::bigint AS bytes
    FROM "Page" p
    JOIN "Section" s ON p."sectionId" = s."id"
    JOIN "Notebook" n ON s."notebookId" = n."id"
    GROUP BY n."ownerId"`;
  const bytesByOwner = new Map(byteRows.map((r) => [r.ownerId, Number(r.bytes)]));

  const detailed = await Promise.all(
    users.map(async (u) => {
      const [sections, lockedSections, pages, tasksDone, lastPage, lastNote, lastTask] =
        await Promise.all([
          prisma.section.count({ where: { notebook: { ownerId: u.id } } }),
          prisma.section.count({ where: { notebook: { ownerId: u.id }, isLocked: true } }),
          prisma.page.count({ where: { section: { notebook: { ownerId: u.id } } } }),
          prisma.task.count({ where: { ownerId: u.id, done: true } }),
          prisma.page.findFirst({
            where: { section: { notebook: { ownerId: u.id } } },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true },
          }),
          prisma.quickNote.findFirst({
            where: { ownerId: u.id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
          prisma.task.findFirst({
            where: { ownerId: u.id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
        ]);

      const activityDates = [lastPage?.updatedAt, lastNote?.createdAt, lastTask?.createdAt].filter(
        Boolean
      ) as Date[];
      const lastActive =
        activityDates.length > 0
          ? new Date(Math.max(...activityDates.map((d) => d.getTime())))
          : null;

      return {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        joinedAt: u.createdAt,
        notebooks: u._count.notebooks,
        sections,
        lockedSections,
        pages,
        quickNotes: u._count.quickNotes,
        tasks: u._count.tasks,
        tasksDone,
        lastActive,
        contentBytes: bytesByOwner.get(u.id) ?? 0,
      };
    })
  );

  res.json({
    totals: {
      users: userCount,
      notebooks: notebookCount,
      sections: sectionCount,
      pages: pageCount,
      quickNotes: quickNoteCount,
      tasks: taskCount,
      links: linkCount,
    },
    users: detailed,
  });
});

/** Permanently delete a registered user and all of their data. */
router.delete("/users/:id", async (req: Request, res) => {
  const userId = req.params.id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const notebooks = await prisma.notebook.findMany({
    where: { ownerId: userId },
    select: { id: true, sections: { select: { id: true } } },
  });
  const sectionIds = notebooks.flatMap((nb) => nb.sections.map((s) => s.id));
  const pageIds =
    sectionIds.length > 0
      ? (
          await prisma.page.findMany({
            where: { sectionId: { in: sectionIds } },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [];

  await prisma.$transaction(async (tx) => {
    if (pageIds.length > 0) {
      await tx.pageLink.deleteMany({
        where: { OR: [{ sourcePageId: { in: pageIds } }, { targetPageId: { in: pageIds } }] },
      });
      await tx.pageDocState.deleteMany({ where: { pageId: { in: pageIds } } });
      // Clear M2M tags before pages
      for (const pageId of pageIds) {
        await tx.page.update({
          where: { id: pageId },
          data: { tags: { set: [] } },
        });
      }
      await tx.page.deleteMany({ where: { id: { in: pageIds } } });
    }
    if (sectionIds.length > 0) {
      await tx.section.deleteMany({ where: { id: { in: sectionIds } } });
    }
    await tx.notebook.deleteMany({ where: { ownerId: userId } });
    await tx.quickNote.deleteMany({ where: { ownerId: userId } });
    // Subtasks first (self-FK), then remaining tasks
    await tx.task.deleteMany({ where: { ownerId: userId, parentTaskId: { not: null } } });
    await tx.task.deleteMany({ where: { ownerId: userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  res.status(204).end();
});

export default router;
