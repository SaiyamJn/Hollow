import type { Task } from "./types";

// Browser notifications for due tasks. The web app can only notify while a
// tab is open, so a poller (AppShell) calls notifyDueTasks with fresh data.
const PREF_KEY = "hollow-task-reminders";
const SENT_KEY = "hollow-notified-tasks";

export function remindersPref(): boolean {
  return localStorage.getItem(PREF_KEY) === "true";
}

function remindersActive(): boolean {
  return remindersPref() && "Notification" in window && Notification.permission === "granted";
}

/** Returns the effective state (false if the browser permission was denied). */
export async function setRemindersEnabled(on: boolean): Promise<boolean> {
  if (!on || !("Notification" in window)) {
    localStorage.setItem(PREF_KEY, "false");
    return false;
  }
  const permission = await Notification.requestPermission();
  const granted = permission === "granted";
  localStorage.setItem(PREF_KEY, granted ? "true" : "false");
  return granted;
}

export function notifyDueTasks(tasks: Task[]) {
  if (!remindersActive()) return;
  const sent = new Set<string>(JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]"));
  const now = Date.now();
  let changed = false;

  for (const task of tasks.flatMap((t) => [t, ...(t.subtasks ?? [])])) {
    if (task.done || !task.dueAt) continue;
    const due = new Date(task.dueAt).getTime();
    // Only fire for tasks that became due recently — not the whole overdue
    // backlog the first time reminders get switched on.
    if (due > now || now - due > 6 * 60 * 60 * 1000) continue;
    const key = `${task.id}:${task.dueAt}`;
    if (sent.has(key)) continue;
    new Notification("Task due", { body: task.title });
    sent.add(key);
    changed = true;
  }

  if (changed) localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-300)));
}
