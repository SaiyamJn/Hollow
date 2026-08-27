import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export function storageKeyFor(pageId: string, uploadId: string) {
  return path.join(pageId, uploadId);
}

export function absolutePath(storageKey: string) {
  return path.join(UPLOAD_DIR, storageKey);
}

export async function writeUpload(pageId: string, buffer: Buffer): Promise<{ uploadId: string; storageKey: string }> {
  await ensureUploadDir();
  const uploadId = randomUUID();
  const storageKey = storageKeyFor(pageId, uploadId);
  const filePath = absolutePath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return { uploadId, storageKey };
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  return fs.readFile(absolutePath(storageKey));
}

export async function deleteUploadFiles(storageKeys: string[]) {
  await Promise.all(
    storageKeys.map(async (key) => {
      try {
        await fs.unlink(absolutePath(key));
      } catch {
        // already gone
      }
    })
  );
}

export async function deletePageUploadDir(pageId: string) {
  try {
    await fs.rm(absolutePath(pageId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}
