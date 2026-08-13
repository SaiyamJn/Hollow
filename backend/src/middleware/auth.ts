// JWT auth: login/register mint a token with `{ userId, sid }`. Every request
// verifies the signature and checks that the AuthSession row is still active.
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export interface AuthedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export type JwtPayload = {
  userId: string;
  sid?: string;
};

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    if (!payload.userId || !payload.sid) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const session = await prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.userId || session.revokedAt) {
      return res.status(401).json({ error: "Session ended. Please sign in again." });
    }

    req.userId = payload.userId;
    req.sessionId = payload.sid;

    const age = Date.now() - session.lastSeenAt.getTime();
    if (age > LAST_SEEN_THROTTLE_MS) {
      void prisma.authSession
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
