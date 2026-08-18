import type { TaskRepeatRule } from "./types";

export type RepeatEnd = "never" | "on" | "after";

export const WEEKDAY_OPTIONS: { value: number; short: string; label: string }[] = [
  { value: 0, short: "S", label: "Sun" },
  { value: 1, short: "M", label: "Mon" },
  { value: 2, short: "T", label: "Tue" },
  { value: 3, short: "W", label: "Wed" },
  { value: 4, short: "T", label: "Thu" },
  { value: 5, short: "F", label: "Fri" },
  { value: 6, short: "S", label: "Sat" },
];

export const UNIT_OPTIONS: { value: TaskRepeatRule; singular: string; plural: string }[] = [
  { value: "daily", singular: "day", plural: "days" },
  { value: "weekly", singular: "week", plural: "weeks" },
  { value: "monthly", singular: "month", plural: "months" },
  { value: "yearly", singular: "year", plural: "years" },
];

export function normalizeRepeatDays(days: number[] | null | undefined): number[] | null {
  if (!days?.length) return null;
  const clean = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  return clean.length ? clean : null;
}

export function clampInterval(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, Math.floor(n)));
}

export function normalizeRepeatEnd(end: string | null | undefined): RepeatEnd {
  if (end === "on" || end === "after") return end;
  return "never";
}

export function defaultWeeklyDays(due: Date | null | undefined): number[] {
  return [due ? due.getDay() : new Date().getDay()];
}

export type RepeatLabelInput = {
  rule: TaskRepeatRule | null | undefined;
  days?: number[] | null;
  interval?: number | null;
  end?: RepeatEnd | null;
  until?: Date | string | null;
  count?: number | null;
};

export function formatRepeatLabel(
  ruleOrInput: TaskRepeatRule | null | undefined | RepeatLabelInput,
  days?: number[] | null,
  interval?: number | null,
  end?: RepeatEnd | null,
  until?: Date | string | null,
  count?: number | null
) {
  const input: RepeatLabelInput =
    ruleOrInput && typeof ruleOrInput === "object" && "rule" in ruleOrInput
      ? ruleOrInput
      : { rule: ruleOrInput as TaskRepeatRule | null | undefined, days, interval, end, until, count };

  if (!input.rule) return "Does not repeat";

  const step = clampInterval(input.interval ?? 1);
  const unit = UNIT_OPTIONS.find((u) => u.value === input.rule)!;
  const unitWord = step === 1 ? unit.singular : unit.plural;
  let core = step === 1 && input.rule === "daily" ? "Every day" : `Every ${step} ${unitWord}`;

  if (input.rule === "weekly") {
    const d = normalizeRepeatDays(input.days);
    if (d?.length) {
      const names = d.map((n) => WEEKDAY_OPTIONS.find((o) => o.value === n)?.label ?? n).join(", ");
      core = `${core} · ${names}`;
    }
  }

  const e = normalizeRepeatEnd(input.end ?? null);
  if (e === "on" && input.until) {
    const dt = typeof input.until === "string" ? new Date(input.until) : input.until;
    if (!Number.isNaN(dt.getTime())) {
      core += ` · until ${dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
  } else if (e === "after" && input.count) {
    core += ` · ${input.count}×`;
  }

  return core;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function weekIndex(day: Date, anchor: Date): number {
  return Math.floor((startOfDay(day).getTime() - startOfDay(anchor).getTime()) / (7 * 86400000));
}

function matchesWeekly(day: Date, days: number[] | null, interval: number, anchor: Date): boolean {
  const selected = days?.length ? days : [anchor.getDay()];
  if (!selected.includes(day.getDay())) return false;
  if (interval <= 1) return true;
  const idx = weekIndex(day, anchor);
  return idx >= 0 && idx % interval === 0;
}

function advanceSimple(from: Date, rule: TaskRepeatRule, interval: number): Date {
  const next = new Date(from);
  const step = clampInterval(interval);
  switch (rule) {
    case "daily":
      next.setDate(next.getDate() + step);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * step);
      break;
    case "monthly": {
      const day = next.getDate();
      next.setMonth(next.getMonth() + step);
      if (next.getDate() < day) next.setDate(0);
      break;
    }
    case "yearly":
      next.setFullYear(next.getFullYear() + step);
      break;
  }
  return startOfDay(next);
}

export function nextDueAt(
  from: Date,
  rule: TaskRepeatRule,
  days?: number[] | null,
  interval = 1,
  seriesAnchor?: Date | null
): Date {
  const step = clampInterval(interval);
  const anchor = seriesAnchor ? new Date(seriesAnchor) : new Date(from);

  if (rule === "weekly" && days?.length) {
    for (let i = 1; i <= 7 * step + 14; i++) {
      const cand = addDays(from, i);
      if (matchesWeekly(cand, days, step, anchor)) return startOfDay(cand);
    }
    return advanceSimple(from, "weekly", step);
  }

  return advanceSimple(from, rule, step);
}

export function withinRepeatBounds(
  day: Date,
  opts: {
    end?: RepeatEnd | null;
    until?: Date | string | null;
    count?: number | null;
    occurrenceIndex?: number;
  }
): boolean {
  const e = normalizeRepeatEnd(opts.end ?? null);
  if (e === "on" && opts.until) {
    const until = typeof opts.until === "string" ? new Date(opts.until) : opts.until;
    if (!Number.isNaN(until.getTime())) {
      return startOfDay(day).getTime() <= startOfDay(until).getTime();
    }
  }
  if (e === "after" && opts.count != null && opts.count > 0) {
    return (opts.occurrenceIndex ?? 0) < opts.count;
  }
  return true;
}
