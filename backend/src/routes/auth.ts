import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const SESSION_TTL = "7d";

const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(USERNAME_RE, "Username may only contain letters, numbers, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
  deviceName: z.string().max(120).optional(),
  platform: z.string().max(40).optional(),
  client: z.string().max(40).optional(),
});

// Accept `login` (preferred) or legacy `email` field — either email or username.
const loginSchema = z
  .object({
    password: z.string().min(1),
    login: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    deviceName: z.string().max(120).optional(),
    platform: z.string().max(40).optional(),
    client: z.string().max(40).optional(),
  })
  .refine((d) => Boolean(d.login?.trim() || d.email?.trim()), {
    message: "Email or username is required",
  });

function publicUser(user: { id: string; email: string; username: string; name: string }) {
  return { id: user.id, email: user.email, username: user.username, name: user.name };
}

function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

function clientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim().slice(0, 64) || null;
  }
  return req.socket?.remoteAddress?.slice(0, 64) ?? null;
}

function deviceMeta(body: { deviceName?: string; platform?: string; client?: string }, req: AuthedRequest) {
  const platform = (body.platform ?? "unknown").trim().slice(0, 40) || "unknown";
  const client = (body.client ?? "unknown").trim().slice(0, 40) || "unknown";
  const fallback =
    client === "hollow-web" ? "Hollow Web" : client === "hollow-mobile" ? "Hollow Mobile" : "Hollow";
  const deviceName = (body.deviceName ?? fallback).trim().slice(0, 120) || fallback;
  return { deviceName, platform, client, ip: clientIp(req) };
}

async function issueSession(
  userId: string,
  meta: { deviceName: string; platform: string; client: string; ip: string | null }
) {
  const session = await prisma.authSession.create({
    data: {
      userId,
      deviceName: meta.deviceName,
      platform: meta.platform,
      client: meta.client,
      ip: meta.ip,
    },
  });
  const token = jwt.sign({ userId, sid: session.id }, process.env.JWT_SECRET!, {
    expiresIn: SESSION_TTL,
  });
  return { token, sessionId: session.id };
}

function publicSession(
  s: {
    id: string;
    deviceName: string;
    platform: string;
    client: string;
    createdAt: Date;
    lastSeenAt: Date;
  },
  currentId?: string
) {
  return {
    id: s.id,
    deviceName: s.deviceName,
    platform: s.platform,
    client: s.client,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: currentId ? s.id === currentId : false,
  };
}

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const email = parsed.data.email.trim().toLowerCase();
    const username = normalizeUsername(parsed.data.username);
    const { password, name } = parsed.data;

    const [byEmail, byUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { username } }),
    ]);
    if (byEmail) return res.status(409).json({ error: "Email already registered" });
    if (byUsername) return res.status(409).json({ error: "Username already taken" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, username, passwordHash, name: name.trim() },
    });
    const { token } = await issueSession(user.id, deviceMeta(parsed.data, req));
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err: any) {
    console.error("Register failed:", err);
    if (err?.code === "P2022" || err?.code === "P2021") {
      return res.status(503).json({
        error: "Database is missing a recent migration. Run: npx prisma migrate deploy",
      });
    }
    res.status(500).json({ error: "Couldn't create account" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const identifier = (parsed.data.login ?? parsed.data.email)!.trim();
    const { password } = parsed.data;

    const user = identifier.includes("@")
      ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
      : await prisma.user.findUnique({ where: { username: normalizeUsername(identifier) } });

    if (!user) return res.status(401).json({ error: "Invalid email/username or password" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email/username or password" });

    const { token } = await issueSession(user.id, deviceMeta(parsed.data, req));
    res.json({ token, user: publicUser(user) });
  } catch (err: any) {
    console.error("Login failed:", err);
    if (err?.code === "P2022" || err?.code === "P2021") {
      return res.status(503).json({
        error: "Database is missing a recent migration. Run: npx prisma migrate deploy",
      });
    }
    res.status(500).json({ error: "Couldn't sign in" });
  }
});

/** Cheap session check for clients — avoids loading the full notebooks tree. */
router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, email: true, username: true, name: true },
  });
  if (!user) return res.status(401).json({ error: "Invalid or expired token" });
  res.json({ user: publicUser(user) });
});

/** Active devices / sessions for this account. */
router.get("/sessions", requireAuth, async (req: AuthedRequest, res) => {
  const sessions = await prisma.authSession.findMany({
    where: { userId: req.userId!, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      deviceName: true,
      platform: true,
      client: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });
  res.json({ sessions: sessions.map((s) => publicSession(s, req.sessionId)) });
});

/** Revoke one session (remote sign-out). */
router.delete("/sessions/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = String(req.params.id || "");
  const session = await prisma.authSession.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.revokedAt) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ ok: true, current: session.id === req.sessionId });
});

/** Sign out every other device; keep this one. */
router.post("/sessions/revoke-others", requireAuth, async (req: AuthedRequest, res) => {
  const result = await prisma.authSession.updateMany({
    where: {
      userId: req.userId!,
      revokedAt: null,
      NOT: { id: req.sessionId! },
    },
    data: { revokedAt: new Date() },
  });
  res.json({ ok: true, revoked: result.count });
});

/** End the current session (server-side logout). */
router.post("/logout", requireAuth, async (req: AuthedRequest, res) => {
  if (req.sessionId) {
    await prisma.authSession.updateMany({
      where: { id: req.sessionId, userId: req.userId!, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ ok: true });
});

export default router;
