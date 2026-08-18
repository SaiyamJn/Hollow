/** Hollow focus classes — important × urgent, in app voice. */

export type TaskFocus = "none" | "critical" | "steady" | "swift" | "quiet";

export function normalizeFocus(value: string | null | undefined): TaskFocus {
  if (value === "critical" || value === "steady" || value === "swift" || value === "quiet") {
    return value;
  }
  return "none";
}
