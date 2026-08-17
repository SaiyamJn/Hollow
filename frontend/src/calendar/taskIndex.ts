import type { Task } from "../lib/types";
import { addDays, dayKey, startOfDay } from "./dateUtils";

export type CalendarTask = Task & {
  due: Date;
  virtual?: boolean;
  sourceId?: string;
};

function advance(from: Date, rule: NonNullable<Task["repeatRule"]>): Date {
  const next = new Date(from);
  switch (rule) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly": {
      const day = next.getDate();
      next.setMonth(next.getMonth() + 1);
      if (next.getDate() < day) next.setDate(0);
      break;
    }
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return startOfDay(next);
}

function firstOnOrAfter(
  anchor: Date,
  onOrAfter: Date,
  rule: NonNullable<Task["repeatRule"]>
): Date {
  let cursor = startOfDay(anchor);
  const target = startOfDay(onOrAfter);
  if (cursor >= target) return cursor;

  switch (rule) {
    case "daily":
      return target;
    case "weekly": {
      const days = Math.ceil((target.getTime() - cursor.getTime()) / 86400000);
      const weeks = Math.ceil(days / 7);
      cursor = addDays(cursor, Math.max(0, weeks) * 7);
      while (cursor < target) cursor = advance(cursor, rule);
      return cursor;
    }
    case "monthly": {
      const months =
        (target.getFullYear() - cursor.getFullYear()) * 12 +
        (target.getMonth() - cursor.getMonth());
      for (let i = 0; i < Math.max(0, months); i++) cursor = advance(cursor, rule);
      while (cursor < target) cursor = advance(cursor, rule);
      return cursor;
    }
    case "yearly": {
      const years = target.getFullYear() - cursor.getFullYear();
      for (let i = 0; i < Math.max(0, years); i++) cursor = advance(cursor, rule);
      while (cursor < target) cursor = advance(cursor, rule);
      return cursor;
    }
  }
}

function withTime(day: Date, template: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    template.getHours(),
    template.getMinutes(),
    template.getSeconds(),
    template.getMilliseconds()
  );
}

export function datedTasks(tasks: Task[] | undefined): CalendarTask[] {
  if (!tasks?.length) return [];
  const out: CalendarTask[] = [];
  for (const t of tasks) {
    if (t.dueAt) {
      const due = new Date(t.dueAt);
      if (!Number.isNaN(due.getTime())) out.push({ ...t, due });
    }
    for (const s of t.subtasks ?? []) {
      if (s.dueAt) {
        const due = new Date(s.dueAt);
        if (!Number.isNaN(due.getTime())) out.push({ ...s, due });
      }
    }
  }
  return out;
}

/** Project recurring tasks onto each occurrence day for the calendar only. */
export function expandForRange(
  items: CalendarTask[],
  rangeStart: Date,
  rangeEnd: Date,
  maxPerTask = 120
): CalendarTask[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const out: CalendarTask[] = [];

  for (const t of items) {
    const dueDay = startOfDay(t.due);
    if (dueDay >= start && dueDay <= end) {
      out.push(t);
    }

    if (!t.repeatRule || t.done) continue;

    const firstAfterDue = advance(dueDay, t.repeatRule);
    let cursor = firstOnOrAfter(firstAfterDue, start, t.repeatRule);
    let n = 0;
    while (cursor <= end && n < maxPerTask) {
      if (cursor >= start && cursor.getTime() !== dueDay.getTime()) {
        out.push({
          ...t,
          id: `${t.id}__${dayKey(cursor)}`,
          due: withTime(cursor, t.due),
          virtual: true,
          sourceId: t.id,
          done: false,
        });
      }
      cursor = advance(cursor, t.repeatRule);
      n += 1;
    }
  }

  return out;
}

export function groupByDay(items: CalendarTask[]): Map<string, CalendarTask[]> {
  const map = new Map<string, CalendarTask[]>();
  for (const t of items) {
    const key = dayKey(t.due);
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!!a.virtual !== !!b.virtual) return a.virtual ? 1 : -1;
      return a.due.getTime() - b.due.getTime() || a.title.localeCompare(b.title);
    });
  }
  return map;
}

export function tasksOnDay(byDay: Map<string, CalendarTask[]>, day: Date): CalendarTask[] {
  return byDay.get(dayKey(day)) ?? [];
}
