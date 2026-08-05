import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const nameSchema = z.object({ name: z.string().min(1) });

async function getOwnedPage(pageId: string, userId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { section: { include: { notebook: true } } },
  });
  if (!page || page.section.notebook.ownerId !== userId) return null;
  return page;
}

router.post("/pages/:id/tags", async (req: AuthedRequest, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const page = await getOwnedPage(req.params.id, req.userId!);
  if (!page) return res.status(404).json({ error: "Not found" });

  const name = parsed.data.name.trim();
  const tag = await prisma.tag.upsert({
    where: { name },
    create: { name, pages: { connect: { id: page.id } } },
    update: { pages: { connect: { id: page.id } } },
  });
  res.status(201).json(tag);
});

router.delete("/pages/:id/tags/:tagId", async (req: AuthedRequest, res) => {
  const page = await getOwnedPage(req.params.id, req.userId!);
  if (!page) return res.status(404).json({ error: "Not found" });
  await prisma.page.update({
    where: { id: page.id },
    data: { tags: { disconnect: { id: req.params.tagId } } },
  });
  res.status(204).end();
});

export default router;
