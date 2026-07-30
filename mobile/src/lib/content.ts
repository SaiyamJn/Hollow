// Pages saved from the web are BlockNote JSON; the mobile v1 editor is plain
// text (per 04-mobile-spec.md this is an accepted open implementation choice
// over a native block editor). This extracts readable text from block JSON;
// plain content passes through unchanged.

interface InlineContent {
  type?: string;
  text?: string;
  content?: InlineContent[];
}

interface BlockJson {
  type?: string;
  content?: InlineContent[] | { type: string };
  children?: BlockJson[];
}

function inlineText(content: BlockJson["content"]): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => item.text ?? (Array.isArray(item.content) ? inlineText(item.content) : ""))
    .join("");
}

function blockLines(blocks: BlockJson[], depth: number): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    const indent = "  ".repeat(depth);
    lines.push(indent + inlineText(block.content));
    if (block.children?.length) lines.push(...blockLines(block.children, depth + 1));
  }
  return lines;
}

export function contentToText(raw: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return blockLines(parsed, 0).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    // not JSON — already plain text
  }
  return raw;
}

/** True when the stored content is rich BlockNote JSON (mobile edits flatten it). */
export function isRichContent(raw: string): boolean {
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}
