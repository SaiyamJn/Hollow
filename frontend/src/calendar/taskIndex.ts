import type { Task } from "../lib/types";
import { dayKey } from "./dateUtils";

export type CalendarTask = Task & { due: Date };

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
