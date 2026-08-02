import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "hollow-page-pos:";

export interface PagePosition {
  /** Caret offset in the plain-text body. */
  selection: number;
  scrollOffset?: number;
}

export async function loadPagePosition(pageId: string): Promise<PagePosition | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + pageId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PagePosition;
    if (typeof parsed?.selection !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePagePosition(pageId: string, pos: PagePosition) {
  try {
    await AsyncStorage.setItem(PREFIX + pageId, JSON.stringify(pos));
  } catch {
    // ignore storage errors
  }
}
