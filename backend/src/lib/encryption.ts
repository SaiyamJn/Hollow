// Encryption for Hollow content at rest.
//
// 1) Locked sections (user vault password):
//    PBKDF2 (100k, SHA-256) → 32-byte key + AES-256-GCM.
//    Key is derived per-request and never stored.
//
// 2) Everything else (unlocked pages, quick notes, tasks, Yjs snapshots):
//    AES-256-GCM with a server CONTENT_ENCRYPTION_KEY (or a key derived from
//    JWT_SECRET). Stored as `h1.<base64>` so legacy plaintext rows still read.
//
// Payload layout for both (base64): [12-byte IV][16-byte auth tag][ciphertext].
import crypto from "crypto";

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const AT_REST_PREFIX = "h1.";

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
  if (buf.length < 28) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

let cachedAtRestKey: Buffer | null = null;

/**
 * 32-byte AES key for server-side at-rest encryption.
 * Prefer CONTENT_ENCRYPTION_KEY (64-char hex). Falls back to a stable hash of
 * JWT_SECRET so short secrets still work — never crash create/save routes.
 */
function getAtRestKey(): Buffer {
  if (cachedAtRestKey) return cachedAtRestKey;

  const raw = process.env.CONTENT_ENCRYPTION_KEY?.trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      cachedAtRestKey = Buffer.from(raw, "hex");
    } else {
      try {
        const b64 = Buffer.from(raw, "base64");
        if (b64.length === 32) cachedAtRestKey = b64;
      } catch {
        // fall through
      }
      if (!cachedAtRestKey) {
        cachedAtRestKey = crypto.createHash("sha256").update(raw).digest();
      }
    }
    return cachedAtRestKey;
  }

  const jwt = process.env.JWT_SECRET?.trim();
  if (jwt) {
    if (jwt.length < 16) {
      console.warn(
        "[hollow] JWT_SECRET is short (<16). Set CONTENT_ENCRYPTION_KEY=" +
          "`openssl rand -hex 32` in .env for a dedicated at-rest key."
      );
    }
    cachedAtRestKey = crypto.createHash("sha256").update(`hollow-at-rest:${jwt}`).digest();
    return cachedAtRestKey;
  }

  throw new Error(
    "CONTENT_ENCRYPTION_KEY or JWT_SECRET is required to encrypt content at rest. " +
      "Add CONTENT_ENCRYPTION_KEY=$(openssl rand -hex 32) to .env and recreate the backend container."
  );
}

/** Call once at startup so misconfig is obvious in logs before the first write. */
export function assertAtRestKeyConfigured(): void {
  getAtRestKey();
  if (!process.env.CONTENT_ENCRYPTION_KEY?.trim()) {
    console.warn(
      "[hollow] CONTENT_ENCRYPTION_KEY is unset — deriving at-rest key from JWT_SECRET. " +
        "Set a dedicated hex key in .env before rotating JWT_SECRET."
    );
  }
}

export function isSealedAtRest(value: string): boolean {
  return value.startsWith(AT_REST_PREFIX);
}

/** Encrypt plaintext for DB storage (unlocked content). Idempotent if already sealed. */
export function sealAtRest(plainText: string): string {
  if (isSealedAtRest(plainText)) return plainText;
  return AT_REST_PREFIX + encrypt(plainText, getAtRestKey());
}

/**
 * Decrypt server-sealed values. Legacy plaintext (pre-migration) passes through
 * unchanged so existing rows keep working until the next write reseals them.
 */
export function unsealAtRest(stored: string): string {
  if (!stored) return stored;
  if (!isSealedAtRest(stored)) return stored;
  return decrypt(stored.slice(AT_REST_PREFIX.length), getAtRestKey());
}
