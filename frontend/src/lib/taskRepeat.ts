import type { TaskRepeatRule } from "./types";

export const REPEAT_OPTIONS: { value: TaskRepeatRule | null; label: string }[] = [
  { value: null, label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function formatRepeatLabel(rule: TaskRepeatRule | null | undefined) {
  if (!rule) return "Does not repeat";
  return REPEAT_OPTIONS.find((o) => o.value === rule)?.label ?? rule;
}
