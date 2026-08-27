import crypto from "crypto";

function secret() {
  return process.env.JWT_SECRET ?? process.env.CONTENT_ENCRYPTION_KEY ?? "hollow-dev";
}

/** Signed token so `<img src>` can load private uploads without Authorization headers. */
export function signUploadToken(uploadId: string, pageId: string): string {
  return crypto.createHmac("sha256", secret()).update(`${uploadId}:${pageId}`).digest("base64url");
}

export function verifyUploadToken(uploadId: string, pageId: string, token: string): boolean {
  if (!token) return false;
  const expected = signUploadToken(uploadId, pageId);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
