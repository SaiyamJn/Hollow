/** Shared recurrence helpers for tasks (weekdays 0=Sun … 6=Sat). */

export type RepeatRule = "daily" | "weekly" | "monthly" | "yearly";
export type RepeatEnd = "never" | "on" | "after";

export function parseRepeatDays(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const days = [...new Set(parsed.map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
    return days.length ? days : null;
  } catch {
    return null;
  }
}

export function serializeRepeatDays(days: number[] | null | undefined): string | null {
  if (!days?.length) return null;
  const clean = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  return clean.length ? JSON.stringify(clean) : null;
}

export function clampInterval(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, Math.floor(n)));
}

export function normalizeRepeatEnd(end: string | null | undefined): RepeatEnd {
  if (end === "on" || end === "after") return end;
  return "never";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function weekIndex(day: Date, anchor: Date): number {
  const a = startOfDay(anchor).getTime();
  const b = startOfDay(day).getTime();
  return Math.floor((b - a) / (7 * 24 * 60 * 60 * 1000));
}

function matchesWeekly(day: Date, days: number[] | null, interval: number, anchor: Date): boolean {
  const selected = days?.length ? days : [anchor.getDay()];
  if (!selected.includes(day.getDay())) return false;
  if (interval <= 1) return true;
  const idx = weekIndex(day, anchor);
  return idx >= 0 && idx % interval === 0;
}

function advanceSimple(from: Date, rule: RepeatRule, interval: number): Date {
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
  return next;
}

/** Next due after `from` for a rule (interval, optional weekly weekdays, series anchor). */
export function nextDueAt(
  from: Date,
  rule: RepeatRule,
  days?: number[] | null,
  interval = 1,
  seriesAnchor?: Date | null
): Date {
  const step = clampInterval(interval);
  const anchor = seriesAnchor ? new Date(seriesAnchor) : new Date(from);

  if (rule === "weekly" && days?.length) {
    for (let i = 1; i <= 7 * step + 14; i++) {
      const cand = addDays(from, i);
      if (matchesWeekly(cand, days, step, anchor)) return cand;
    }
    return advanceSimple(from, "weekly", step);
  }

  return advanceSimple(from, rule, step);
}

/**
 * Advance until the next due is strictly after `after` (default: now).
 * Completing an overdue repeat must not spawn another already-past due.
 */
export function nextFutureDueAt(
  from: Date,
  rule: RepeatRule,
  days?: number[] | null,
  interval = 1,
  seriesAnchor?: Date | null,
  after: Date = new Date()
): Date {
  const anchor = seriesAnchor ? new Date(seriesAnchor) : new Date(from);
  let cursor = nextDueAt(from, rule, days, interval, anchor);
  for (let n = 0; n < 500 && cursor.getTime() <= after.getTime(); n++) {
    cursor = nextDueAt(cursor, rule, days, interval, anchor);
  }
  return cursor;
}

/** Whether a generated occurrence on `day` is still within the series end rules. */
export function withinRepeatBounds(
  day: Date,
  opts: {
    end?: RepeatEnd | null;
    until?: Date | null;
    /** Remaining occurrences including the live due (for "after"). */
    count?: number | null;
    occurrenceIndex?: number;
  }
): boolean {
  const end = normalizeRepeatEnd(opts.end ?? null);
  if (end === "on" && opts.until) {
    return startOfDay(day).getTime() <= startOfDay(opts.until).getTime();
  }
  if (end === "after" && opts.count != null && opts.count > 0) {
    const idx = opts.occurrenceIndex ?? 0;
    return idx < opts.count;
  }
  return true;
}
