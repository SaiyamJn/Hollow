/** Hollow focus classes — important × urgent, in app voice. */

export type TaskFocus = "none" | "critical" | "steady" | "swift" | "quiet";

type FocusMeta = {
  id: TaskFocus;
  label: string;
  hint: string;
};

/** Matrix order for the 2×2 (excluding none): TL critical, TR steady, BL swift, BR quiet */
export const FOCUS_MATRIX: TaskFocus[] = ["critical", "steady", "swift", "quiet"];

export const FOCUS_META: Record<TaskFocus, FocusMeta> = {
  none: {
    id: "none",
    label: "Clear",
    hint: "No focus signal",
  },
  critical: {
    id: "critical",
    label: "Now",
    hint: "Important · Urgent",
  },
  steady: {
    id: "steady",
    label: "Anchor",
    hint: "Important · Not urgent",
  },
  swift: {
    id: "swift",
    label: "Nudge",
    hint: "Urgent · Not important",
  },
  quiet: {
    id: "quiet",
    label: "Later",
    hint: "Neither — whenever",
  },
};

export function normalizeFocus(value: string | null | undefined): TaskFocus {
  if (value === "critical" || value === "steady" || value === "swift" || value === "quiet") {
    return value;
  }
  return "none";
}

function focusRank(focus: TaskFocus | string | null | undefined): number {
  switch (normalizeFocus(focus)) {
    case "critical":
      return 4;
    case "steady":
      return 3;
    case "swift":
      return 2;
    case "quiet":
      return 1;
    default:
      return 0;
  }
}

export function focusColor(
  focus: TaskFocus,
  palette: { accent: string; danger: string; textSecondary: string; warn?: string }
): string | null {
  switch (focus) {
    case "critical":
      return palette.danger;
    case "steady":
      return palette.accent;
    case "swift":
      return palette.warn ?? "#b45309";
    case "quiet":
      return palette.textSecondary;
    default:
      return null;
  }
}

/** Hex accent → soft wash that works in light and dark. */
export function withAlpha(hexOrRgb: string, alpha: number): string {
  if (hexOrRgb.startsWith("#") && (hexOrRgb.length === 7 || hexOrRgb.length === 4)) {
    const h =
      hexOrRgb.length === 4
        ? `#${hexOrRgb[1]}${hexOrRgb[1]}${hexOrRgb[2]}${hexOrRgb[2]}${hexOrRgb[3]}${hexOrRgb[3]}`
        : hexOrRgb;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const m = hexOrRgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  return hexOrRgb;
}

/** Soft washes — prefer `useFocusColors().washFor` when custom tints are enabled. */
export function focusWash(focus: TaskFocus, accent = "#62d9ae"): string {
  switch (focus) {
    case "critical":
      return "rgba(220, 38, 38, 0.16)";
    case "steady":
      return withAlpha(accent, 0.18);
    case "swift":
      return "rgba(180, 83, 9, 0.16)";
    case "quiet":
      return "rgba(100, 116, 139, 0.14)";
    default:
      return "transparent";
  }
}

export function focusBorder(focus: TaskFocus, accent = "#62d9ae", fallback = "#e4e4e0"): string {
  switch (focus) {
    case "critical":
      return "rgba(220, 38, 38, 0.28)";
    case "steady":
      return withAlpha(accent, 0.32);
    case "swift":
      return "rgba(180, 83, 9, 0.3)";
    case "quiet":
      return "rgba(100, 116, 139, 0.28)";
    default:
      return fallback;
  }
}

/** Sort for calendar / boards: open first, then focus priority, starred, time. */
export function sortByFocusPriority<
  T extends {
    done?: boolean;
    focus?: string | null;
    starred?: boolean;
    dueAt?: string | null;
    due?: Date;
  },
>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    const byFocus = focusRank(b.focus) - focusRank(a.focus);
    if (byFocus !== 0) return byFocus;
    if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1;
    const ta = a.due ? a.due.getTime() : a.dueAt ? new Date(a.dueAt).getTime() : 0;
    const tb = b.due ? b.due.getTime() : b.dueAt ? new Date(b.dueAt).getTime() : 0;
    return ta - tb;
  });
}
