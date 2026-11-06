// Pages saved from the web are BlockNote JSON; the mobile v1 editor is plain
// text with rich media support for images and handwriting annotations.

export interface ImageSegment {
  type: "image";
  id: string;
  url: string;
  caption?: string;
}

export interface AnnotationSegment {
  type: "annotation";
  id: string;
  drawing: string;
  caption?: string;
}

export interface TextSegment {
  type: "text";
  id: string;
  text: string;
}

export type PageSegment = TextSegment | ImageSegment | AnnotationSegment;

interface InlineContent {
  type?: string;
  text?: string;
  content?: InlineContent[];
}

interface BlockJson {
  id?: string;
  type?: string;
  props?: Record<string, any>;
  content?: InlineContent[] | { type: string };
  children?: BlockJson[];
}

function inlineText(content: BlockJson["content"]): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => (item && typeof item === "object" ? item.text ?? (Array.isArray(item.content) ? inlineText(item.content) : "") : ""))
    .join("");
}

function blockLines(blocks: BlockJson[], depth: number): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const indent = "  ".repeat(depth);
    const text = inlineText(block.content);
    let line = text;

    if (block.type === "heading") {
      const level = block.props?.level ?? 1;
      const prefix = "#".repeat(Math.min(3, Math.max(1, level))) + " ";
      line = `${prefix}${text}`;
    } else if (block.type === "bulletListItem") {
      line = `- ${text}`;
    } else if (block.type === "numberedListItem") {
      line = `1. ${text}`;
    } else if (block.type === "checkListItem") {
      const checked = Boolean(block.props?.checked);
      line = `${checked ? "- [x]" : "- [ ]"} ${text}`;
    } else if (block.type === "blockquote") {
      line = `> ${text}`;
    } else if (block.type === "codeBlock") {
      line = `\`\`\`\n${text}\n\`\`\``;
    }

    lines.push(indent + line);
    if (Array.isArray(block.children) && block.children.length) lines.push(...blockLines(block.children, depth + 1));
  }
  return lines;
}

export function contentToText(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return blockLines(parsed, 0).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    // not JSON — already plain text
  }
  return raw;
}

/** True when the stored content is rich BlockNote JSON. */
export function isRichContent(raw: string): boolean {
  if (!raw || typeof raw !== "string") return false;
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

/**
 * Converts markdown-formatted text into BlockNote-compatible JSON blocks,
 * preserving headings, checklists, bullet lists, numbered lists, and quotes.
 */
export function textToBlockNoteJson(text: string, existingMediaBlocks: any[] = []): string {
  const lines = text.split("\n");
  const blocks: any[] = [];
  let inCode = false;
  const codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        blocks.push({
          type: "codeBlock",
          content: [{ type: "text", text: codeBuffer.join("\n"), styles: {} }],
        });
        codeBuffer.length = 0;
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      continue;
    }

    if (rawLine.startsWith("### ")) {
      blocks.push({
        type: "heading",
        props: { level: 3 },
        content: [{ type: "text", text: rawLine.slice(4), styles: {} }],
      });
    } else if (rawLine.startsWith("## ")) {
      blocks.push({
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: rawLine.slice(3), styles: {} }],
      });
    } else if (rawLine.startsWith("# ")) {
      blocks.push({
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: rawLine.slice(2), styles: {} }],
      });
    } else if (rawLine.startsWith("- [ ] ") || rawLine.startsWith("- [x] ") || rawLine.startsWith("- [X] ")) {
      const checked = rawLine.startsWith("- [x] ") || rawLine.startsWith("- [X] ");
      blocks.push({
        type: "checkListItem",
        props: { checked },
        content: [{ type: "text", text: rawLine.slice(6), styles: {} }],
      });
    } else if (rawLine.startsWith("- ") || rawLine.startsWith("* ")) {
      blocks.push({
        type: "bulletListItem",
        content: [{ type: "text", text: rawLine.slice(2), styles: {} }],
      });
    } else if (/^\d+\.\s/.test(rawLine)) {
      const match = rawLine.match(/^(\d+\.\s)(.*)$/);
      blocks.push({
        type: "numberedListItem",
        content: [{ type: "text", text: match ? match[2] : rawLine, styles: {} }],
      });
    } else if (rawLine.startsWith("> ")) {
      blocks.push({
        type: "blockquote",
        content: [{ type: "text", text: rawLine.slice(2), styles: {} }],
      });
    } else {
      blocks.push({
        type: "paragraph",
        content: rawLine ? [{ type: "text", text: rawLine, styles: {} }] : [],
      });
    }
  }

  if (inCode && codeBuffer.length) {
    blocks.push({
      type: "codeBlock",
      content: [{ type: "text", text: codeBuffer.join("\n"), styles: {} }],
    });
  }

  return JSON.stringify([...blocks, ...existingMediaBlocks]);
}

/**
 * Extracts structured page segments from either BlockNote JSON or Markdown text
 * so images and handwritten annotations can be displayed visually on mobile.
 */
export function extractPageSegments(raw: string): PageSegment[] {
  if (!raw || typeof raw !== "string") return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const segments: PageSegment[] = [];
      let pendingTextLines: string[] = [];

      const flushText = () => {
        const combined = pendingTextLines.join("\n").trim();
        if (combined) {
          segments.push({
            type: "text",
            id: `text-${segments.length}`,
            text: combined,
          });
        }
        pendingTextLines = [];
      };

      for (let i = 0; i < parsed.length; i++) {
        const b = parsed[i] as BlockJson;
        if (!b || typeof b !== "object") continue;
        if (b.type === "image" && (b.props?.url || b.props?.src)) {
          flushText();
          segments.push({
            type: "image",
            id: b.id || `img-${i}`,
            url: b.props.url || b.props.src,
            caption: b.props.caption || "",
          });
        } else if (b.type === "annotation" && b.props?.drawing) {
          flushText();
          segments.push({
            type: "annotation",
            id: b.id || `ann-${i}`,
            drawing: b.props.drawing,
            caption: b.props.caption || "",
          });
        } else {
          pendingTextLines.push(...blockLines([b], 0));
        }
      }
      flushText();
      return segments;
    }
  } catch {
    // Plain text content
  }

  // Parse markdown image syntax: ![caption](url) in plain text
  const mdRegex = /!\[(.*?)\]\((.*?)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const segments: PageSegment[] = [];

  while ((match = mdRegex.exec(raw)) !== null) {
    const textBefore = raw.slice(lastIndex, match.index).trim();
    if (textBefore) {
      segments.push({
        type: "text",
        id: `txt-${segments.length}`,
        text: textBefore,
      });
    }
    segments.push({
      type: "image",
      id: `img-${segments.length}`,
      caption: match[1],
      url: match[2],
    });
    lastIndex = mdRegex.lastIndex;
  }

  const remainder = raw.slice(lastIndex).trim();
  if (remainder || segments.length === 0) {
    segments.push({
      type: "text",
      id: `txt-${segments.length}`,
      text: remainder || raw,
    });
  }

  return segments;
}
