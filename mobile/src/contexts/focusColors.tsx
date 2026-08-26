import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { darkColors, lightColors } from "../theme";
import {
  focusColor as baseFocusColor,
  type TaskFocus,
  withAlpha,
} from "../lib/taskFocus";
import { useTheme } from "./theme";

export type FocusCategory = "critical" | "steady" | "swift" | "quiet";
export type FocusColorOverrides = Partial<Record<FocusCategory, string>>;

const STORAGE_KEY = "hollow.focusColors";

export const FOCUS_COLOR_PRESETS = [
  "#dc2626",
  "#f87171",
  "#ea580c",
  "#eab308",
  "#b45309",
  "#0e9f72",
  "#6edcb6",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#64748b",
  "#979aa1",
  "#1c1c1a",
  "#edeef0",
] as const;

/** Normalize user hex to #RRGGBB or null if invalid. */
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

export function defaultFocusColor(category: FocusCategory, theme: "light" | "dark"): string {
  const palette = theme === "dark" ? darkColors : lightColors;
  return baseFocusColor(category, palette)!;
}

interface FocusColorsContextValue {
  overrides: FocusColorOverrides;
  /** Resolved color for a focus class (custom or theme default). */
  colorFor: (focus: TaskFocus) => string | null;
  washFor: (focus: TaskFocus) => string;
  borderFor: (focus: TaskFocus, fallback?: string) => string;
  setCategoryColor: (category: FocusCategory, hex: string | null) => void;
  resetAll: () => void;
  isCustom: (category: FocusCategory) => boolean;
}

const FocusColorsContext = createContext<FocusColorsContextValue | null>(null);

export function FocusColorsProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [overrides, setOverrides] = useState<FocusColorOverrides>({});

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as FocusColorOverrides;
        const next: FocusColorOverrides = {};
        for (const key of ["critical", "steady", "swift", "quiet"] as FocusCategory[]) {
          const hex = parsed[key] ? normalizeHex(parsed[key]!) : null;
          if (hex) next[key] = hex;
        }
        setOverrides(next);
      } catch {
        /* ignore corrupt prefs */
      }
    });
  }, []);

  const persist = useCallback((next: FocusColorOverrides) => {
    setOverrides(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const colorFor = useCallback(
    (focus: TaskFocus): string | null => {
      if (focus === "none") return null;
      return overrides[focus] ?? baseFocusColor(focus, colors);
    },
    [overrides, colors]
  );

  const washFor = useCallback(
    (focus: TaskFocus) => {
      const c = colorFor(focus);
      return c ? withAlpha(c, 0.18) : "transparent";
    },
    [colorFor]
  );

  const borderFor = useCallback(
    (focus: TaskFocus, fallback = colors.border) => {
      const c = colorFor(focus);
      return c ? withAlpha(c, 0.32) : fallback;
    },
    [colorFor, colors.border]
  );

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

  const resetAll = useCallback(() => persist({}), [persist]);

  const isCustom = useCallback((category: FocusCategory) => Boolean(overrides[category]), [overrides]);

  const value = useMemo(
    () => ({
      overrides,
      colorFor,
      washFor,
      borderFor,
      setCategoryColor,
      resetAll,
      isCustom,
    }),
    [overrides, colorFor, washFor, borderFor, setCategoryColor, resetAll, isCustom]
  );

  return <FocusColorsContext.Provider value={value}>{children}</FocusColorsContext.Provider>;
}

export function useFocusColors() {
  const ctx = useContext(FocusColorsContext);
  if (!ctx) throw new Error("useFocusColors must be used within a FocusColorsProvider");
  return ctx;
}
