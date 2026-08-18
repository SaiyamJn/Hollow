/** Hollow focus classes — important × urgent, in app voice. */

import { formatCompactClockTime } from "./timeFormat";

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

/** Soft pill / card washes → CSS token classes. */
export const FOCUS_SOFT_BG: Record<TaskFocus, string> = {
  none: "focus-pill-none",
  critical: "focus-pill-critical",
  steady: "focus-pill-steady",
  swift: "focus-pill-swift",
  quiet: "focus-pill-quiet",
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
  return formatCompactClockTime(d);
}
