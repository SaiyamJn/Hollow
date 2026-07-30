import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth";
import notebookRoutes from "./routes/notebooks";
import sectionRoutes from "./routes/sections";
import pageRoutes from "./routes/pages";
import quickNoteRoutes from "./routes/quicknotes";
import taskRoutes from "./routes/tasks";
import tagRoutes from "./routes/tags";
import adminRoutes from "./routes/admin";
import { registerCollab } from "./sockets/collab";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/notebooks", notebookRoutes);
app.use("/pages", pageRoutes);
app.use("/quick-notes", quickNoteRoutes);
app.use("/tasks", taskRoutes);
app.use("/admin", adminRoutes);
// Section and tag routes span multiple prefixes (/notebooks/:id/sections,
// /sections/:id, /tags, /pages/:id/tags), so those routers declare full
// paths and mount at root.
app.use("/", sectionRoutes);
app.use("/", tagRoutes);

const server = http.createServer(app);
// WebSocket upgrade handshake: the client sends a normal HTTP GET with
// `Connection: Upgrade` + `Upgrade: websocket` headers; the server replies
// `101 Switching Protocols` and the same TCP connection becomes a persistent
// two-way socket. Socket.io handles this (with long-polling fallback) and
// adds "rooms" — here one room per page, so edits broadcast only to clients
// currently viewing that page.
const io = new Server(server, { cors: { origin: "*" } });

// Phase 5: the raw `page:update` relay is replaced by Yjs CRDT sync — see
// sockets/collab.ts for the room/doc lifecycle and encrypted persistence.
registerCollab(io);

// Express 4 doesn't catch rejected promises from async handlers; log instead
// of letting Node kill the process on an unhandled rejection.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API listening on port ${PORT}`));
