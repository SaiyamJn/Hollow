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
