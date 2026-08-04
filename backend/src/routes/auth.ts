import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(USERNAME_RE, "Username may only contain letters, numbers, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
});

// Accept `login` (preferred) or legacy `email` field — either email or username.
const loginSchema = z
  .object({
    password: z.string().min(1),
    login: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
  })
  .refine((d) => Boolean(d.login?.trim() || d.email?.trim()), {
    message: "Email or username is required",
  });

function signToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}

function publicUser(user: { id: string; email: string; username: string; name: string }) {
  return { id: user.id, email: user.email, username: user.username, name: user.name };
}

function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

router.post("/register", async (req, res) => {
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
  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
});

router.post("/login", async (req, res) => {
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

  res.json({ token: signToken(user.id), user: publicUser(user) });
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

export default router;
