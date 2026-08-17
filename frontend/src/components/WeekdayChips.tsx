import clsx from "clsx";
import { WEEKDAY_OPTIONS, defaultWeeklyDays, normalizeRepeatDays } from "../lib/taskRepeat";
import type { TaskRepeatRule } from "../lib/types";

/** Google Tasks–style weekday chips when repeat is weekly. */
export function WeekdayChips({
  days,
  due,
  onChange,
}: {
  days: number[] | null | undefined;
  due: Date | null;
  onChange: (days: number[]) => void;
}) {
  const selected = normalizeRepeatDays(days) ?? defaultWeeklyDays(due);
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {WEEKDAY_OPTIONS.map((d) => {
        const on = selected.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            title={d.label}
            onClick={() => {
              const set = new Set(selected);
              if (on) {
                if (set.size <= 1) return;
                set.delete(d.value);
              } else {
                set.add(d.value);
              }
              onChange([...set].sort((a, b) => a - b));
            }}
            className={clsx(
              "h-8 w-8 rounded-full text-xs font-medium transition-colors",
              on
                ? "bg-accent text-surface-0"
                : "border border-border text-secondary hover:border-secondary hover:text-primary"
            )}
          >
            {d.short}
          </button>
        );
      })}
    </div>
  );
}

export function applyRepeatChange(
  current: { repeat: TaskRepeatRule | null; repeatDays?: number[] | null; due: Date | null },
  rule: TaskRepeatRule | null
) {
  if (!rule) return { repeat: null as TaskRepeatRule | null, repeatDays: null as number[] | null };
  if (rule === "weekly") {
    return {
      repeat: rule,
      repeatDays: normalizeRepeatDays(current.repeatDays) ?? defaultWeeklyDays(current.due),
    };
  }
  return { repeat: rule, repeatDays: null as number[] | null };
}
