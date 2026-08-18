/** Hollow focus classes — important × urgent, in app voice. */

export type TaskFocus = "none" | "critical" | "steady" | "swift" | "quiet";

export type FocusMeta = {
  id: TaskFocus;
  label: string;
  hint: string;
  important: boolean;
  urgent: boolean;
};

/** Matrix order for the 2×2 (excluding none): TL critical, TR steady, BL swift, BR quiet */
export const FOCUS_MATRIX: TaskFocus[] = ["critical", "steady", "swift", "quiet"];

export const FOCUS_META: Record<TaskFocus, FocusMeta> = {
  none: {
    id: "none",
    label: "Clear",
    hint: "No focus signal",
    important: false,
    urgent: false,
  },
  critical: {
    id: "critical",
    label: "Now",
    hint: "Important · Urgent",
    important: true,
    urgent: true,
  },
  steady: {
    id: "steady",
    label: "Anchor",
    hint: "Important · Not urgent",
    important: true,
    urgent: false,
  },
  swift: {
    id: "swift",
    label: "Nudge",
    hint: "Urgent · Not important",
    important: false,
    urgent: true,
  },
  quiet: {
    id: "quiet",
    label: "Later",
    hint: "Neither — whenever",
    important: false,
    urgent: false,
  },
};

export function normalizeFocus(value: string | null | undefined): TaskFocus {
  if (value === "critical" || value === "steady" || value === "swift" || value === "quiet") {
    return value;
  }
  return "none";
}

export function focusFromAxes(important: boolean, urgent: boolean): TaskFocus {
  if (important && urgent) return "critical";
  if (important && !urgent) return "steady";
  if (!important && urgent) return "swift";
  return "quiet";
}

export function focusRank(focus: TaskFocus | string | null | undefined): number {
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
function withAlpha(hexOrRgb: string, alpha: number): string {
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

/** Soft washes — pass theme accent so light/dark teal both read correctly. */
export function focusWash(focus: TaskFocus, accent = "#62d9ae"): string {
  switch (focus) {
    case "critical":
      return "rgba(220, 38, 38, 0.12)";
    case "steady":
      return withAlpha(accent, 0.14);
    case "swift":
      return "rgba(180, 83, 9, 0.12)";
    case "quiet":
      return "rgba(100, 116, 139, 0.12)";
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

export function focusSoftBg(
  focus: TaskFocus,
  palette: { accent: string; danger: string; textSecondary: string; surface2: string }
): string {
  return focusWash(focus, palette.accent) || palette.surface2;
}
