// CRDT-based conflict resolution over WebSockets.
//
// Each open page has one server-side Y.Doc. Clients send incremental Yjs
// updates (commutative + idempotent, so concurrent edits from multiple
// clients merge automatically instead of last-write-wins). The server applies
// every update to its own copy, relays it to the page's Socket.io room, and
// periodically persists the encoded document state to Postgres — encrypted
// with the PBKDF2-derived section key when the section is locked, exactly
// like plain page content.
import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { decrypt, deriveKey, encrypt } from "../lib/encryption";

const PERSIST_DEBOUNCE_MS = 2000;

interface DocEntry {
  doc: Y.Doc;
  awareness: Awareness;
  clients: Set<string>; // socket ids currently editing this page
  key: Buffer | null; // AES key when the page's section is locked
  saveTimer: NodeJS.Timeout | null;
  hadStoredState: boolean;
}

interface AuthedSocket extends Socket {
  userId?: string;
}

const docs = new Map<string, DocEntry>();

/** True while at least one client has the page's collab doc open. */
export function hasActiveDoc(pageId: string): boolean {
  return docs.has(pageId);
}

async function persist(pageId: string, entry: DocEntry) {
  let state = Buffer.from(Y.encodeStateAsUpdate(entry.doc)).toString("base64");
  if (entry.key) state = encrypt(state, entry.key);
  try {
    await prisma.pageDocState.upsert({
      where: { pageId },
      create: { pageId, state },
      update: { state },
    });
  } catch (err) {
    console.error(`Failed to persist doc state for page ${pageId}:`, err);
  }
}

function schedulePersist(pageId: string, entry: DocEntry) {
  if (entry.saveTimer) clearTimeout(entry.saveTimer);
  entry.saveTimer = setTimeout(() => void persist(pageId, entry), PERSIST_DEBOUNCE_MS);
}

export function registerCollab(io: Server) {
  // Same JWT bearer flow as the REST middleware, but carried in the
  // Socket.io handshake instead of an Authorization header.
  io.use((socket: AuthedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      const payload = jwt.verify(token ?? "", process.env.JWT_SECRET!) as { userId: string };
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    const joinedPages = new Set<string>();

    socket.on(
      "collab:join",
      async (
        { pageId, password }: { pageId: string; password?: string },
        callback?: (res: { error?: string; state?: string; awareness?: string; seed?: boolean }) => void
      ) => {
        const page = await prisma.page.findUnique({
          where: { id: pageId },
          include: { section: { include: { notebook: true } }, docState: true },
        });
        if (!page || page.section.notebook.ownerId !== socket.userId)
          return callback?.({ error: "Not found" });

        // Locked sections require the password on join, mirroring the
        // x-section-password header on REST routes.
        let key: Buffer | null = null;
        if (page.section.isLocked) {
          if (!password || !page.section.passwordHash || !page.section.salt)
            return callback?.({ error: "Section is locked" });
          const ok = await bcrypt.compare(password, page.section.passwordHash);
          if (!ok) return callback?.({ error: "Incorrect section password" });
          key = deriveKey(password, page.section.salt);
        }

        let entry = docs.get(pageId);
        if (!entry) {
          const doc = new Y.Doc();
          let hadStoredState = false;
          if (page.docState) {
            try {
              let b64 = page.docState.state;
              if (key) b64 = decrypt(b64, key);
              Y.applyUpdate(doc, Buffer.from(b64, "base64"));
              hadStoredState = true;
            } catch {
              // undecryptable/corrupt snapshot — start from an empty doc
            }
          }
          entry = { doc, awareness: new Awareness(doc), clients: new Set(), key, saveTimer: null, hadStoredState };
          docs.set(pageId, entry);
        }

        entry.clients.add(socket.id);
        joinedPages.add(pageId);
        socket.join(`collab:${pageId}`);

        callback?.({
          state: Buffer.from(Y.encodeStateAsUpdate(entry.doc)).toString("base64"),
          awareness: Buffer.from(
            encodeAwarenessUpdate(entry.awareness, [...entry.awareness.getStates().keys()])
          ).toString("base64"),
          // First client on a page with no stored CRDT state seeds the doc
          // from the page's saved content column.
          seed: !entry.hadStoredState && entry.clients.size === 1,
        });
      }
    );

    socket.on("collab:update", ({ pageId, update }: { pageId: string; update: string }) => {
      const entry = docs.get(pageId);
      if (!entry || !entry.clients.has(socket.id)) return;
      Y.applyUpdate(entry.doc, new Uint8Array(Buffer.from(update, "base64")));
      socket.to(`collab:${pageId}`).emit("collab:update", { pageId, update });
      entry.hadStoredState = true;
      schedulePersist(pageId, entry);
    });

    // Awareness = ephemeral presence (cursors, selections, user names).
    // Applied to a server-side instance so late joiners get current cursors.
    socket.on("collab:awareness", ({ pageId, update }: { pageId: string; update: string }) => {
      const entry = docs.get(pageId);
      if (!entry || !entry.clients.has(socket.id)) return;
      applyAwarenessUpdate(entry.awareness, new Uint8Array(Buffer.from(update, "base64")), socket.id);
      socket.to(`collab:${pageId}`).emit("collab:awareness", { pageId, update });
    });

    function leavePage(pageId: string) {
      const entry = docs.get(pageId);
      if (!entry) return;
      entry.clients.delete(socket.id);
      socket.leave(`collab:${pageId}`);
      if (entry.clients.size === 0) {
        // Last editor left: flush the snapshot and evict the doc from memory.
        if (entry.saveTimer) clearTimeout(entry.saveTimer);
        docs.delete(pageId);
        void persist(pageId, entry).finally(() => {
          entry.awareness.destroy();
          entry.doc.destroy();
        });
      }
    }

    socket.on("collab:leave", ({ pageId }: { pageId: string }) => {
      joinedPages.delete(pageId);
      leavePage(pageId);
    });

    socket.on("disconnect", () => {
      for (const pageId of joinedPages) leavePage(pageId);
    });
  });
}
