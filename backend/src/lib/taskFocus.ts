/** Hollow focus classes — important × urgent, in app voice. */

export type TaskFocus = "none" | "critical" | "steady" | "swift" | "quiet";

export const TASK_FOCUS_VALUES: TaskFocus[] = ["none", "critical", "steady", "swift", "quiet"];

export type FocusMeta = {
  id: TaskFocus;
  /** Short chip label */
  label: string;
  /** One-line hint under the label */
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

/** Sort weight — higher first (critical → steady → swift → quiet → none). */
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
