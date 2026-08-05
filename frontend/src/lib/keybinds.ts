import { create } from "zustand";

export type KeybindId =
  | "palette"
  | "home"
  | "notebooks"
  | "tasks"
  | "quickNotes"
  | "daily"
  | "graph"
  | "settings"
  | "focus"
  | "theme"
  | "escape";

export interface KeyCombo {
  /** Normalized key: a-z, 0-9, escape, comma, backslash, slash, period, etc. */
  key: string;
  /** Ctrl (Win/Linux) or Cmd (Mac) */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface KeybindDef {
  id: KeybindId;
  label: string;
  /** Fires even while typing in inputs (palette / escape). */
  always?: boolean;
}

export const KEYBIND_DEFS: KeybindDef[] = [
  { id: "palette", label: "Open command palette", always: true },
  { id: "home", label: "Go home" },
  { id: "notebooks", label: "Go to notebooks" },
  { id: "tasks", label: "Go to tasks" },
  { id: "quickNotes", label: "Go to quick notes" },
  { id: "graph", label: "Go to links / graph" },
  { id: "daily", label: "Open today's daily note" },
  { id: "settings", label: "Open settings" },
  { id: "focus", label: "Toggle focus mode" },
  { id: "theme", label: "Toggle light / dark theme" },
  { id: "escape", label: "Close action / go back in notebooks", always: true },
];

export const DEFAULT_KEYBINDS: Record<KeybindId, KeyCombo> = {
  palette: { key: "k", mod: true },
  home: { key: "1", mod: true },
  notebooks: { key: "2", mod: true },
  tasks: { key: "4", mod: true },
  quickNotes: { key: "3", mod: true },
  graph: { key: "5", mod: true },
  daily: { key: "d", mod: true },
  settings: { key: ",", mod: true },
  focus: { key: "\\", mod: true },
  theme: { key: "l", mod: true, shift: true },
  escape: { key: "escape" },
};

// Bumped so remapped nav defaults don't collide with older saved binds.
const STORAGE_KEY = "hollow-keybinds-v2";
const isMac = typeof navigator !== "undefined" && /MAC|IPHONE|IPAD/.test(navigator.platform.toUpperCase());

export function normalizeKey(key: string): string {
  if (key === "Escape") return "escape";
  if (key === ",") return ",";
  if (key === ".") return ".";
  if (key === "/") return "/";
  if (key === "\\") return "\\";
  if (key === " ") return "space";
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}

export function displayKey(key: string): string {
  const map: Record<string, string> = {
    escape: "Esc",
    ",": ",",
    ".": ".",
    "/": "/",
    "\\": "\\",
    space: "Space",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
  };
  if (map[key]) return map[key];
  return key.length === 1 ? key.toUpperCase() : key;
}

export function formatCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (combo.alt) parts.push(isMac ? "⌥" : "Alt");
  if (combo.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(displayKey(combo.key));
  return parts.join(" ");
}

export function comboFromEvent(e: KeyboardEvent): KeyCombo | null {
  const key = normalizeKey(e.key);
  // Ignore bare modifier presses
  if (["control", "meta", "alt", "shift"].includes(key)) return null;
  const mod = e.ctrlKey || e.metaKey;
  return {
    key,
    ...(mod ? { mod: true } : {}),
    ...(e.shiftKey ? { shift: true } : {}),
    ...(e.altKey ? { alt: true } : {}),
  };
}

export function matchesCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  const key = normalizeKey(e.key);
  if (key !== combo.key) return false;
  const hasMod = e.ctrlKey || e.metaKey;
  if (!!combo.mod !== hasMod) return false;
  if (!!combo.shift !== e.shiftKey) return false;
  if (!!combo.alt !== e.altKey) return false;
  return true;
}

export function comboEquals(a: KeyCombo, b: KeyCombo): boolean {
  return a.key === b.key && !!a.mod === !!b.mod && !!a.shift === !!b.shift && !!a.alt === !!b.alt;
}

function loadKeybinds(): Record<KeybindId, KeyCombo> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KEYBINDS };
    const parsed = JSON.parse(raw) as Partial<Record<KeybindId, KeyCombo>>;
    return { ...DEFAULT_KEYBINDS, ...parsed };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

interface KeybindsState {
  binds: Record<KeybindId, KeyCombo>;
  setBind: (id: KeybindId, combo: KeyCombo) => { ok: true } | { ok: false; conflict: KeybindId };
  resetDefaults: () => void;
}

export const useKeybindsStore = create<KeybindsState>()((set, get) => ({
  binds: loadKeybinds(),
  setBind: (id, combo) => {
    const current = get().binds;
    // Find another action already using this combo
    const conflict = (Object.keys(current) as KeybindId[]).find(
      (other) => other !== id && comboEquals(current[other], combo)
    );
    if (conflict) return { ok: false, conflict };

    const next = { ...current, [id]: combo };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ binds: next });
    return { ok: true };
  },
  resetDefaults: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ binds: { ...DEFAULT_KEYBINDS } });
  },
}));

export function getKeybindLabel(id: KeybindId): string {
  return formatCombo(useKeybindsStore.getState().binds[id] ?? DEFAULT_KEYBINDS[id]);
}
