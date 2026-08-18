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

/** Soft pill / card washes (legacy aliases → CSS token classes). */
export const FOCUS_SOFT_BG: Record<TaskFocus, string> = {
  none: "focus-pill-none",
  critical: "focus-pill-critical",
  steady: "focus-pill-steady",
  swift: "focus-pill-swift",
  quiet: "focus-pill-quiet",
};

export const FOCUS_SOFT_BORDER: Record<TaskFocus, string> = {
  none: "",
  critical: "",
  steady: "",
  swift: "",
  quiet: "",
};

export const FOCUS_PANE: Record<TaskFocus, string> = {
  none: "focus-pane focus-pane-none",
  critical: "focus-pane focus-pane-critical",
  steady: "focus-pane focus-pane-steady",
  swift: "focus-pane focus-pane-swift",
  quiet: "focus-pane focus-pane-quiet",
};

export const FOCUS_DOT: Record<TaskFocus, string> = {
  none: "focus-dot",
  critical: "focus-dot-critical",
  steady: "focus-dot-steady",
  swift: "focus-dot-swift",
  quiet: "focus-dot-quiet",
};

export const FOCUS_TEXT: Record<TaskFocus, string> = {
  none: "text-secondary",
  critical: "focus-ink-critical",
  steady: "focus-ink-steady",
  swift: "focus-ink-swift",
  quiet: "focus-ink-quiet",
};

export function formatTaskTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return null; // date-only
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Token colors that sit inside Hollow’s existing palette. */
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
      return palette.warn ?? "rgb(180, 83, 9)";
    case "quiet":
      return palette.textSecondary;
    default:
      return null;
  }
}
