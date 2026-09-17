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

/** True when the stored content is rich BlockNote JSON. */
export function isRichContent(raw: string): boolean {
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

/**
 * Extracts structured page segments from either BlockNote JSON or Markdown text
 * so images and handwritten annotations can be displayed visually on mobile.
 */
export function extractPageSegments(raw: string): PageSegment[] {
  if (!raw) return [];

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
