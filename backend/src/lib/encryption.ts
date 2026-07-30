// Encryption at rest for locked sections.
// - PBKDF2 (100k iterations, SHA-256) derives a 32-byte AES key from the
//   section password + a public random salt. The key is derived per-request
//   and never stored, so the server can't decrypt content without the
//   password being presented.
// - AES-256-GCM is authenticated encryption: the auth tag detects tampering
//   or a wrong key, which is why decrypt() throws on a bad password.
// Payload layout (base64): [12-byte IV][16-byte auth tag][ciphertext].
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
