import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { sealAtRest, unsealAtRest } from "../lib/encryption";

const router = Router();
router.use(requireAuth);

const TRASH_MS = 7 * 24 * 60 * 60 * 1000;

const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  done: z.boolean(),
});

const createSchema = z.object({
  // Allow empty strings — blank drafts are created then discarded if left empty.
  title: z.string().default(""),
  content: z.string().default(""),
  color: z.string().optional(),
  kind: z.enum(["note", "list"]).optional(),
  items: z.array(checklistItemSchema).optional(),
});

const patchSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  color: z.string().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  items: z.array(checklistItemSchema).nullable().optional(),
});

type ChecklistItem = z.infer<typeof checklistItemSchema>;

function sealItems(items: ChecklistItem[] | null | undefined): string | null {
  if (items == null) return null;
  return sealAtRest(JSON.stringify(items));
}

function unsealItems(raw: string | null | undefined): ChecklistItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(unsealAtRest(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === "string")
      .map((x) => ({
        id: String(x.id),
        text: typeof x.text === "string" ? x.text : "",
        done: Boolean(x.done),
      }));
  } catch {
    return [];
  }
}

function publicNote<T extends { title?: string; content: string; items?: string | null; kind?: string }>(note: T) {
  const { items: rawItems, ...rest } = note as T & { items?: string | null };
  const kind = (note.kind === "list" ? "list" : "note") as "note" | "list";
  let title = unsealAtRest(note.title ?? "");
  let content = unsealAtRest(note.content);

  // Legacy lists stored the title in content before the title column existed.
  if (kind === "list" && !title.trim() && content.trim()) {
    title = content.trim();
    content = "";
  }

  // Notes may embed a title marker in content when talking to older servers.
  if (kind === "note" && !title.trim()) {
    const mark = "\uFEFF§ ";
    if (content.startsWith(mark)) {
      const restBody = content.slice(mark.length);
      const nl = restBody.indexOf("\n");
      if (nl < 0) {
        title = restBody;
        content = "";
      } else {
        title = restBody.slice(0, nl);
        content = restBody.slice(nl + 1);
      }
    }
  }

  return {
    ...rest,
    title,
    content,
    kind,
    items: kind === "list" ? unsealItems(rawItems) ?? [] : null,
  };
}

/** Hard-delete notes that have sat in the recycle bin longer than 7 days. */
export async function purgeExpiredQuickNotes() {
  const cutoff = new Date(Date.now() - TRASH_MS);
  await prisma.quickNote.deleteMany({
    where: { deletedAt: { not: null, lt: cutoff } },
  });
}

router.get("/", async (req: AuthedRequest, res) => {
  await purgeExpiredQuickNotes();
  const includeArchived = req.query.archived === "true";
  const trashed = req.query.trashed === "true";

  const notes = await prisma.quickNote.findMany({
    where: {
      ownerId: req.userId,
      ...(trashed
        ? { deletedAt: { not: null } }
        : {
            deletedAt: null,
            ...(includeArchived ? {} : { archived: false }),
          }),
    },
    orderBy: trashed
      ? [{ deletedAt: "desc" }]
      : [{ pinned: "desc" }, { sortOrder: "desc" }, { createdAt: "desc" }],
  });
  res.json(notes.map(publicNote));
});

router.post("/reorder", async (req: AuthedRequest, res) => {
  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { ids } = parsed.data;

  const owned = await prisma.quickNote.findMany({
    where: { ownerId: req.userId, id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (owned.length !== ids.length) return res.status(400).json({ error: "Invalid note ids" });

  const base = Date.now();
  // First id in the list sits at the top (highest sortOrder)
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.quickNote.update({
        where: { id },
        data: { sortOrder: base - index },
      })
    )
  );
  res.json({ ok: true });
});

router.post("/", async (req: AuthedRequest, res) => {
  // Coerce null/missing to "" so older clients and blank drafts never trip min-length checks.
  const body = {
    ...req.body,
    title: req.body?.title ?? "",
    content: req.body?.content ?? "",
  };
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const kind = parsed.data.kind ?? "note";
  const title = parsed.data.title.trim();
  // Lists historically used content as the title — accept either.
  let content = parsed.data.content.trim();
  let listTitle = title;
  if (kind === "list" && !listTitle && content) {
    listTitle = content;
    content = "";
  }

  const note = await prisma.quickNote.create({
    data: {
      title: sealAtRest(kind === "list" ? listTitle : title),
      content: sealAtRest(kind === "list" ? "" : content),
      color: parsed.data.color,
      kind,
      items: kind === "list" ? sealItems(parsed.data.items ?? []) : null,
      ownerId: req.userId!,
      sortOrder: Date.now(),
    },
  });
  res.status(201).json(publicNote(note));
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const note = await prisma.quickNote.findUnique({ where: { id: req.params.id } });
  if (!note || note.ownerId !== req.userId || note.deletedAt) {
    return res.status(404).json({ error: "Not found" });
  }

  const { title, content, items, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (title !== undefined) data.title = sealAtRest(title.trim());
  if (content !== undefined) data.content = sealAtRest(content);
  if (items !== undefined) {
    data.items = note.kind === "list" ? sealItems(items) : null;
  }

  const updated = await prisma.quickNote.update({ where: { id: note.id }, data });
  res.json(publicNote(updated));
});

/** Soft-delete (recycle bin) by default; ?permanent=true hard-deletes. */
router.delete("/:id", async (req: AuthedRequest, res) => {
  const note = await prisma.quickNote.findUnique({ where: { id: req.params.id } });
  if (!note || note.ownerId !== req.userId) return res.status(404).json({ error: "Not found" });

  if (req.query.permanent === "true") {
    await prisma.quickNote.delete({ where: { id: note.id } });
  } else if (note.deletedAt) {
    // Already in trash — second delete is permanent.
    await prisma.quickNote.delete({ where: { id: note.id } });
  } else {
    await prisma.quickNote.update({
      where: { id: note.id },
      data: { deletedAt: new Date(), pinned: false },
    });
  }
  res.status(204).end();
});

router.post("/:id/restore", async (req: AuthedRequest, res) => {
  const note = await prisma.quickNote.findUnique({ where: { id: req.params.id } });
  if (!note || note.ownerId !== req.userId || !note.deletedAt) {
    return res.status(404).json({ error: "Not found" });
  }
  const updated = await prisma.quickNote.update({
    where: { id: note.id },
    data: { deletedAt: null },
  });
  res.json(publicNote(updated));
});

export default router;
