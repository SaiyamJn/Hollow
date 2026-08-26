/** Last reading/editing spot per page — browser localStorage only. */

const PREFIX = "hollow-page-pos:";

export interface PagePosition {
  scrollTop: number;
  blockId?: string;
  /** "start" | "end" placement within the block when we only have an id. */
  placement?: "start" | "end";
}

export function loadPagePosition(pageId: string): PagePosition | null {
  try {
    const raw = localStorage.getItem(PREFIX + pageId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PagePosition;
    if (typeof parsed?.scrollTop !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePagePosition(pageId: string, pos: PagePosition) {
  try {
    localStorage.setItem(PREFIX + pageId, JSON.stringify(pos));
  } catch {
    // quota / private mode — ignore
  }
}

export function findEditorScrollParent(from: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = from;
  while (cur) {
    const style = getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY)) return cur;
    cur = cur.parentElement;
  }
  return document.querySelector("main") as HTMLElement | null;
}

function caretClientRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (r.width > 0 || r.height > 0 || r.top > 0) return r;
  }
  const box = range.getBoundingClientRect();
  if (box.width > 0 || box.height > 0 || box.top > 0) return box;
  let node: Node | null = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  if (node instanceof Element) {
    const br = node.tagName === "BR" ? node : node.querySelector("br");
    if (br) return br.getBoundingClientRect();
    return node.getBoundingClientRect();
  }
  return null;
}

/** Keep the caret a band above the bottom (and below the sticky title) while typing. */
export function keepCaretComfort(
  scroller: HTMLElement,
  blockEl?: HTMLElement | null,
  options?: { topPad?: number; bottomRatio?: number }
) {
  let rect = caretClientRect();
  if (!rect || (rect.height === 0 && rect.top === 0 && rect.width === 0)) {
    rect = blockEl?.getBoundingClientRect() ?? null;
  }
  if (!rect) return;
  const box = scroller.getBoundingClientRect();
  const topLimit = box.top + (options?.topPad ?? 72);
  const bottomPad = Math.max(140, box.height * (options?.bottomRatio ?? 0.3));
  const bottomLimit = box.bottom - bottomPad;
  if (rect.bottom > bottomLimit) {
    scroller.scrollTop += rect.bottom - bottomLimit;
  } else if (rect.top < topLimit) {
    scroller.scrollTop -= topLimit - rect.top;
  }
}
