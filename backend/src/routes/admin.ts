import { Router, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// Admins are configured via ADMIN_EMAILS (comma-separated) in .env — no
// schema change needed for a self-hosted deployment. With the variable unset
// the whole /admin surface stays disabled.
async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.length === 0) return res.status(403).json({ error: "Admin access is not configured" });
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
  if (!user || !admins.includes(user.email.toLowerCase())) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
router.use(requireAdmin);

// Aggregate stats only — this endpoint never returns note contents, titles,
// or anything else a user wrote. Locked content is additionally encrypted at
// rest, so even raw sizes below are ciphertext sizes.
router.get("/stats", async (_req: AuthedRequest, res) => {
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
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      _count: { select: { notebooks: true, quickNotes: true, tasks: true } },
    },
  });

  // Approximate storage per user: total characters of page content.
  const byteRows = await prisma.$queryRaw<{ ownerId: string; bytes: bigint }[]>`
    SELECT n."ownerId" AS "ownerId", COALESCE(SUM(LENGTH(p."content")), 0)::bigint AS bytes
    FROM "Page" p
    JOIN "Section" s ON p."sectionId" = s."id"
    JOIN "Notebook" n ON s."notebookId" = n."id"
    GROUP BY n."ownerId"`;
  const bytesByOwner = new Map(byteRows.map((r) => [r.ownerId, Number(r.bytes)]));

  const detailed = await Promise.all(
    users.map(async (u) => {
      const [sections, lockedSections, pages, tasksDone, lastPage] = await Promise.all([
        prisma.section.count({ where: { notebook: { ownerId: u.id } } }),
        prisma.section.count({ where: { notebook: { ownerId: u.id }, isLocked: true } }),
        prisma.page.count({ where: { section: { notebook: { ownerId: u.id } } } }),
        prisma.task.count({ where: { ownerId: u.id, done: true } }),
        prisma.page.findFirst({
          where: { section: { notebook: { ownerId: u.id } } },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
      ]);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        joinedAt: u.createdAt,
        notebooks: u._count.notebooks,
        sections,
        lockedSections,
        pages,
        quickNotes: u._count.quickNotes,
        tasks: u._count.tasks,
        tasksDone,
        lastActive: lastPage?.updatedAt ?? null,
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

export default router;
