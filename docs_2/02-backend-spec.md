# Hollow — backend API spec

Node.js + TypeScript, Express, Socket.io, Prisma, PostgreSQL, Redis.

## Project layout

```
backend/
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  prisma/schema.prisma       (see 01-data-model.md)
  src/
    index.ts
    lib/prisma.ts
    lib/encryption.ts
    middleware/auth.ts
    routes/auth.ts
    routes/notebooks.ts
    routes/sections.ts       (specified below, mirror notebooks.ts)
    routes/pages.ts
    routes/quicknotes.ts     (specified below)
    routes/tasks.ts          (specified below)
    routes/tags.ts           (specified below)
    sockets/collab.ts        (specified below, phase 2)
```

## package.json dependencies

```json
{
  "dependencies": {
    "@prisma/client": "^5.16.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "socket.io": "^4.7.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.0",
    "prisma": "^5.16.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
```

## Environment variables (`.env`)

```
DATABASE_URL=postgresql://hollow:changeme@postgres:5432/hollow
REDIS_URL=redis://redis:6379
JWT_SECRET=replace_with_a_long_random_string
PORT=4000
```

## Encryption module — `lib/encryption.ts` (verbatim)

```ts
import crypto from "crypto";

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function deriveKey(password: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

export function encrypt(plainText: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
```

## Auth middleware — `middleware/auth.ts` (verbatim)

```ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

## Auth routes — `routes/auth.ts`

- `POST /auth/register` — body `{ email, password (min 8), name }`. Hash with
  bcrypt (12 rounds). Return `{ token, user }`. 409 if email taken.
- `POST /auth/login` — body `{ email, password }`. Verify with bcrypt.compare.
  Return `{ token, user }`. 401 on failure.
- JWT: `jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" })`.

## Notebook routes — `routes/notebooks.ts`

All routes behind `requireAuth`.
- `GET /notebooks` — list notebooks owned by `req.userId`, include sections.
- `POST /notebooks` — body `{ title }`, create, scoped to `req.userId`.
- `POST /notebooks/:id/lock` — body `{ password (min 4) }`. Generate salt,
  bcrypt-hash password, set `isLocked=true`. Then internally lock every
  section inside this notebook the same way (same password) so per-page
  encryption applies uniformly.
- `POST /notebooks/:id/unlock` — body `{ password }`. bcrypt.compare against
  stored hash. Return `{ unlocked: true }` on success, 401 otherwise. This
  endpoint only verifies the password for UI purposes — actual content
  decryption happens per-page (see pages routes) using a freshly derived key,
  never a stored one.

## Section routes — `routes/sections.ts`

Mirror `notebooks.ts` exactly, scoped to a parent notebook:
- `GET /notebooks/:notebookId/sections`
- `POST /notebooks/:notebookId/sections` — body `{ title }`
- `POST /sections/:id/lock` — body `{ password }`, same pattern as notebook lock
- `POST /sections/:id/unlock` — body `{ password }`, same pattern

## Page routes — `routes/pages.ts` (verbatim)

```ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { deriveKey, encrypt, decrypt } from "../lib/encryption";

const router = Router();
router.use(requireAuth);

router.get("/:id", async (req: AuthedRequest, res) => {
  const page = await prisma.page.findUnique({ where: { id: req.params.id }, include: { section: true } });
  if (!page) return res.status(404).json({ error: "Not found" });

  if (page.section.isLocked) {
    const password = req.header("x-section-password");
    if (!password || !page.section.salt) return res.status(423).json({ error: "Section is locked" });
    try {
      const key = deriveKey(password, page.section.salt);
      const content = decrypt(page.content, key);
      return res.json({ ...page, content });
    } catch {
      return res.status(401).json({ error: "Incorrect section password" });
    }
  }
  res.json(page);
});

router.put("/:id", async (req: AuthedRequest, res) => {
  const { content } = z.object({ content: z.string() }).parse(req.body);
  const page = await prisma.page.findUnique({ where: { id: req.params.id }, include: { section: true } });
  if (!page) return res.status(404).json({ error: "Not found" });

  let storedContent = content;
  if (page.section.isLocked) {
    const password = req.header("x-section-password");
    if (!password || !page.section.salt) return res.status(423).json({ error: "Section is locked" });
    const key = deriveKey(password, page.section.salt);
    storedContent = encrypt(content, key);
  }

  // After computing storedContent, also: parse `[[Page Title]]` occurrences
  // out of the plaintext `content`, resolve each to a Page in the same
  // notebook (case-insensitive title match), and replace this page's
  // PageLink rows (delete old outgoing links, insert new ones).

  const updated = await prisma.page.update({ where: { id: req.params.id }, data: { content: storedContent } });
  res.json({ ...updated, content });
});

export default router;
```

- `GET /pages/:id/backlinks` — return pages whose `outgoingLinks` target this
  page id (i.e. this page's `incomingLinks`, joined to their source pages).
- `GET /notebooks/:id/graph` — return `{ nodes: [{id,title}], edges:
  [{source,target}] }` for every page + link in the notebook, for the graph
  view.

## Quick notes routes — `routes/quicknotes.ts`

- `GET /quick-notes` — list for `req.userId`, not archived by default
  (`?archived=true` to include them).
- `POST /quick-notes` — body `{ content, color? }`.
- `PATCH /quick-notes/:id` — body any of `{ content, color, pinned, archived }`.
- `DELETE /quick-notes/:id`.

## Tasks routes — `routes/tasks.ts`

- `GET /tasks` — list for `req.userId`, include `subtasks`.
- `POST /tasks` — body `{ title, dueAt?, parentTaskId? }`.
- `PATCH /tasks/:id` — body any of `{ title, done, dueAt }`.
- `DELETE /tasks/:id`.

## Tags routes — `routes/tags.ts`

- `GET /tags` — list all tags with page counts.
- `POST /pages/:id/tags` — body `{ name }`, upsert tag, connect to page.
- `DELETE /pages/:id/tags/:tagId`.

## Realtime — `src/index.ts` (verbatim, phase 1)

```ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth";
import notebookRoutes from "./routes/notebooks";
import pageRoutes from "./routes/pages";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/notebooks", notebookRoutes);
app.use("/pages", pageRoutes);
// mount sections, quick-notes, tasks, tags routers the same way

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("page:join", (pageId: string) => socket.join(`page:${pageId}`));
  socket.on("page:update", ({ pageId, ops }: { pageId: string; ops: unknown }) => {
    socket.to(`page:${pageId}`).emit("page:update", ops);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API listening on port ${PORT}`));
```

### Phase 2 — real collaborative editing

Replace the raw `page:update` relay with a CRDT provider so concurrent edits
merge automatically instead of last-write-wins:
- Add `yjs` + `y-socket.io` (or `y-websocket`) on the backend.
- Each page gets a `Y.Doc`; persist snapshots to Postgres periodically (store
  the encoded Yjs state as a `Bytes`/base64 column, or a separate
  `PageDocState` table) and on the section-lock encryption boundary — encrypt
  the serialized Yjs state the same way plain content is encrypted today.
- Frontend binds BlockNote/TipTap's collaborative extension to the same
  `Y.Doc` via the socket provider.

## Security notes

- bcrypt: 12 rounds for account passwords and lock passwords.
- PBKDF2: 100,000 iterations, SHA-256, 32-byte key (see encryption module).
- JWT: 7-day expiry; add a refresh-token flow later if you want shorter
  access-token lifetimes.
- Add `express-rate-limit` on `/auth/login` and `/auth/register` before
  going live publicly.
- CORS: restrict `origin` to your actual frontend domain(s) once deployed,
  don't leave it as `"*"`.
