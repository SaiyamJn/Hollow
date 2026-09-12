/** Client-side export helpers — no extra dependencies. */

async function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });

  // On mobile browsers, try Web Share API if available for smooth native saving/sharing
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return;
      }
    } catch {
      // User cancelled share or file sharing unsupported, fall back to standard download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoking object URL so mobile Safari / Android Chrome can complete download
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}

/** Download the given content as a `.md` markdown file. */
export function downloadMarkdown(filename: string, markdown: string) {
  downloadText(`${sanitizeFilename(filename)}.md`, markdown, "text/markdown;charset=utf-8");
}

/** Download the given content as a `.txt` file (used for plain notes/lists). */
export function downloadTextFile(filename: string, text: string) {
  downloadText(`${sanitizeFilename(filename)}.txt`, text, "text/plain;charset=utf-8");
}

/**
 * Print rendered HTML as a PDF via the browser's print dialog. The printable
 * HTML is written into a hidden iframe so the app UI stays untouched.
 */
export function printHtml(title: string, bodyHtml: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    document.body.removeChild(frame);
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
             color: #111; line-height: 1.6; padding: 32px; max-width: 46rem; margin: 0 auto; }
      h1 { font-size: 1.6rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
      h2 { font-size: 1.3rem; } h3 { font-size: 1.1rem; }
      img { max-width: 100%; }
      blockquote { border-left: 3px solid #d1d5db; margin: 0; padding-left: 12px; color: #555; }
      pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
      a { color: #0b8a62; }
      ul, ol { padding-left: 1.4rem; }
      @media print { body { padding: 0; } }
    </style>
  </head><body>${bodyHtml}</body></html>`);
  doc.close();

  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Remove after a tick so the dialog has time to render.
    setTimeout(() => document.body.removeChild(frame), 0);
  };
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return cleaned || "export";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
