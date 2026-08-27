import multer from "multer";

const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "application/zip",
  "application/octet-stream",
]);

export const pageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter(_req, file, cb) {
    const mime = file.mimetype || "application/octet-stream";
    if (ALLOWED.has(mime) || mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});
