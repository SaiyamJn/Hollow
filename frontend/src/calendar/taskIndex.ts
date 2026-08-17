import type { Task } from "../lib/types";
import { dayKey, startOfDay } from "./dateUtils";
import {
  clampInterval,
  nextDueAt,
  normalizeRepeatDays,
  normalizeRepeatEnd,
  withinRepeatBounds,
} from "../lib/taskRepeat";

export type CalendarTask = Task & {
  due: Date;
  virtual?: boolean;
  sourceId?: string;
};

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
    const days = t.repeatRule === "weekly" ? normalizeRepeatDays(t.repeatDays) : null;
    const interval = clampInterval(t.repeatInterval ?? 1);
    const endMode = normalizeRepeatEnd(t.repeatEnd);
    const until = t.repeatUntil ? new Date(t.repeatUntil) : null;
    const count = t.repeatCount ?? null;

    if (dueDay >= start && dueDay <= end) {
      out.push(t);
    }

    if (!t.repeatRule || t.done) continue;

    let cursor = nextDueAt(dueDay, t.repeatRule, days, interval, dueDay);
    let n = 0;
    while (cursor <= end && n < maxPerTask) {
      const inBounds = withinRepeatBounds(cursor, {
        end: endMode,
        until,
        count,
        occurrenceIndex: n + 1,
      });
      if (cursor >= start && cursor.getTime() !== dueDay.getTime() && inBounds) {
        out.push({
          ...t,
          id: `${t.id}__${dayKey(cursor)}`,
          due: withTime(cursor, t.due),
          virtual: true,
          sourceId: t.id,
          done: false,
        });
      }
      if (!inBounds) break;
      cursor = nextDueAt(cursor, t.repeatRule, days, interval, dueDay);
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
