import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TaskFocus } from "../lib/taskFocus";

export type FocusCategory = "critical" | "steady" | "swift" | "quiet";
export type FocusColorOverrides = Partial<Record<FocusCategory, string>>;

const STORAGE_KEY = "hollow.focusColors";

export const FOCUS_COLOR_PRESETS = [
  "#dc2626",
  "#f87171",
  "#ea580c",
  "#eab308",
  "#b45309",
  "#0cb879",
  "#5ee9b5",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#64748b",
  "#979aa1",
  "#1c1c1a",
  "#edeef0",
] as const;

export const DEFAULT_FOCUS_COLORS: Record<FocusCategory, { light: string; dark: string }> = {
  critical: { light: "#f43f5e", dark: "#ff4d6d" },
  steady: { light: "#0284c7", dark: "#38bdf8" },
  swift: { light: "#f59e0b", dark: "#fbbf24" },
  quiet: { light: "#8b5cf6", dark: "#a78bfa" },
};

/** Normalize user hex to #rrggbb or null if invalid. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  return null;
}

export function hexToRgba(hex: string, alpha: number): string {
  const norm = normalizeHex(hex);
  if (!norm) return `rgba(128, 128, 128, ${alpha})`;
  const clean = norm.slice(1);
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface FocusColorsContextValue {
  overrides: FocusColorOverrides;
  colorFor: (focus: TaskFocus) => string | null;
  washFor: (focus: TaskFocus) => string;
  setCategoryColor: (category: FocusCategory, hex: string | null) => void;
  resetAll: () => void;
  isCustom: (category: FocusCategory) => boolean;
}

const FocusColorsContext = createContext<FocusColorsContextValue | null>(null);

function applyCssVars(overrides: FocusColorOverrides) {
  const root = document.documentElement;
  const categories: FocusCategory[] = ["critical", "steady", "swift", "quiet"];

  for (const cat of categories) {
    const custom = overrides[cat];
    if (custom) {
      root.style.setProperty(`--focus-${cat}`, custom);
      root.style.setProperty(`--focus-${cat}-wash`, hexToRgba(custom, 0.22));
      root.style.setProperty(`--focus-${cat}-pane`, hexToRgba(custom, 0.14));
    } else {
      root.style.removeProperty(`--focus-${cat}`);
      root.style.removeProperty(`--focus-${cat}-wash`);
      root.style.removeProperty(`--focus-${cat}-pane`);
    }
  }
}

export function FocusColorsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<FocusColorOverrides>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as FocusColorOverrides;
      const next: FocusColorOverrides = {};
      for (const key of ["critical", "steady", "swift", "quiet"] as FocusCategory[]) {
        const hex = parsed[key] ? normalizeHex(parsed[key]!) : null;
        if (hex) next[key] = hex;
      }
      return next;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    applyCssVars(overrides);
  }, [overrides]);

  const persist = useCallback((next: FocusColorOverrides) => {
    setOverrides(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage quota
    }
  }, []);

  const setCategoryColor = useCallback(
    (category: FocusCategory, hex: string | null) => {
      const next = { ...overrides };
      if (!hex) {
        delete next[category];
      } else {
        const normalized = normalizeHex(hex);
        if (!normalized) return;
        next[category] = normalized;
      }
      persist(next);
    },
    [overrides, persist]
  );

  const resetAll = useCallback(() => {
    persist({});
  }, [persist]);

  const isCustom = useCallback(
    (category: FocusCategory) => Boolean(overrides[category]),
    [overrides]
  );

  const colorFor = useCallback(
    (focus: TaskFocus): string | null => {
      if (focus === "none") return null;
      return overrides[focus] ?? null;
    },
    [overrides]
  );

  const washFor = useCallback(
    (focus: TaskFocus): string => {
      const c = colorFor(focus);
      return c ? hexToRgba(c, 0.22) : "transparent";
    },
    [colorFor]
  );

  const value = useMemo(
    () => ({
      overrides,
      colorFor,
      washFor,
      setCategoryColor,
      resetAll,
      isCustom,
    }),
    [overrides, colorFor, washFor, setCategoryColor, resetAll, isCustom]
  );

  return (
    <FocusColorsContext.Provider value={value}>
      {children}
    </FocusColorsContext.Provider>
  );
}

export function useFocusColors() {
  const ctx = useContext(FocusColorsContext);
  if (!ctx) {
    throw new Error("useFocusColors must be used within a FocusColorsProvider");
  }
  return ctx;
}
