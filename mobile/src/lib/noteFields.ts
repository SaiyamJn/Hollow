/** Pack optional title into content for APIs that lack a title column. */
const TITLE_MARK = "\uFEFF§ ";

export function packNoteBody(title: string, body: string) {
  const t = title.trim();
  if (!t) return body;
  return `${TITLE_MARK}${t}\n${body}`;
}

function unpackNoteBody(raw: string): { title: string; content: string } {
  if (!raw.startsWith(TITLE_MARK)) return { title: "", content: raw };
  const rest = raw.slice(TITLE_MARK.length);
  const nl = rest.indexOf("\n");
  if (nl < 0) return { title: rest, content: "" };
  return { title: rest.slice(0, nl), content: rest.slice(nl + 1) };
}

export function resolveNoteFields(note: {
  title?: string | null;
  content?: string | null;
  kind?: string | null;
}) {
  const kind = note.kind === "list" ? "list" : "note";
  const apiTitle = (note.title ?? "").trim();
  const raw = note.content ?? "";

  if (kind === "list") {
    // Prefer title column; fall back to content (legacy lists).
    return { title: apiTitle || raw.trim(), content: apiTitle ? raw : "" };
  }

  if (apiTitle) return { title: apiTitle, content: raw };

  const unpacked = unpackNoteBody(raw);
  if (unpacked.title) return unpacked;
  return { title: "", content: raw };
}
