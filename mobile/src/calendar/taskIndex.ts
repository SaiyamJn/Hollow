import type { Task } from "../lib/types";
import { addDays, dayKey, startOfDay } from "./dateUtils";

export type CalendarTask = Task & { due: Date };

/** Flatten top-level + subtasks; keep only items with a due date. */
export function datedTasks(tasks: Task[] | undefined): CalendarTask[] {
  if (!tasks?.length) return [];
  const out: CalendarTask[] = [];
  for (const t of tasks) {
    if (t.dueAt) out.push({ ...t, due: new Date(t.dueAt) });
    for (const s of t.subtasks ?? []) {
      if (s.dueAt) out.push({ ...s, due: new Date(s.dueAt) });
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
      return a.due.getTime() - b.due.getTime() || a.title.localeCompare(b.title);
    });
  }
  return map;
}

export function tasksOnDay(byDay: Map<string, CalendarTask[]>, day: Date): CalendarTask[] {
  return byDay.get(dayKey(day)) ?? [];
}

/**
 * Stretch: paint light markers for upcoming recurrence instances within range
 * (display-only; only the real dueAt is draggable / editable).
 */
export function recurrenceMarkers(
  task: CalendarTask,
  rangeStart: Date,
  rangeEnd: Date,
  max = 24
): string[] {
  if (!task.repeatRule || task.done) return [];
  const keys: string[] = [];
  let cursor = startOfDay(task.due);
  let n = 0;
  while (cursor <= rangeEnd && n < max) {
    if (cursor > startOfDay(task.due) && cursor >= rangeStart) {
      keys.push(dayKey(cursor));
    }
    if (task.repeatRule === "daily") cursor = addDays(cursor, 1);
    else if (task.repeatRule === "weekly") cursor = addDays(cursor, 7);
    else if (task.repeatRule === "monthly") {
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      cursor = startOfDay(next);
    } else if (task.repeatRule === "yearly") {
      const next = new Date(cursor);
      next.setFullYear(next.getFullYear() + 1);
      cursor = startOfDay(next);
    } else break;
    n += 1;
  }
  return keys;
}

export function buildRecurrenceHintMap(
  items: CalendarTask[],
  rangeStart: Date,
  rangeEnd: Date
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of items) {
    for (const key of recurrenceMarkers(t, rangeStart, rangeEnd)) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}
