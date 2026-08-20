import type { Task } from "./types";

// Browser notifications for due tasks. The web app can only notify while a
// tab is open, so a poller (AppShell) calls notifyDueTasks with fresh data.
const PREF_KEY = "hollow-task-reminders";
const SENT_KEY = "hollow-notified-tasks";
const SNOOZE_KEY = "hollow-notif-snooze";
const SNOOZE_MS = 60 * 60 * 1000;

export type ReminderPrompt = {
  taskId: string;
  title: string;
  kind: "due" | "overdue" | "reminder";
};

type PromptListener = (prompt: ReminderPrompt | null) => void;
type ClearListener = (taskId: string) => void;
let promptListener: PromptListener | null = null;
let clearListener: ClearListener | null = null;
const openNotifications = new Map<string, Notification>();
const snoozeTimers = new Map<string, number>();

export function subscribeReminderPrompt(listener: PromptListener) {
  promptListener = listener;
  return () => {
    if (promptListener === listener) promptListener = null;
  };
}

export function subscribeReminderClear(listener: ClearListener) {
  clearListener = listener;
  return () => {
    if (clearListener === listener) clearListener = null;
  };
}

export function remindersPref(): boolean {
  return localStorage.getItem(PREF_KEY) === "true";
}

function remindersActive(): boolean {
  return remindersPref() && "Notification" in window && Notification.permission === "granted";
}

function getSnoozes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function setSnoozes(map: Record<string, number>) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
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

export function dismissTaskNotification(taskId: string) {
  const timer = snoozeTimers.get(taskId);
  if (timer) {
    window.clearTimeout(timer);
    snoozeTimers.delete(taskId);
  }
  closeSystemNotification(taskId);
  clearListener?.(taskId);
}

function closeSystemNotification(taskId: string) {
  const existing = openNotifications.get(taskId);
  existing?.close();
  openNotifications.delete(taskId);
}

export function snoozeTaskReminder(
  taskId: string,
  title = "Task",
  kind: ReminderPrompt["kind"] = "reminder"
) {
  const snoozes = getSnoozes();
  snoozes[taskId] = Date.now() + SNOOZE_MS;
  setSnoozes(snoozes);
  dismissTaskNotification(taskId);
  try {
    const sent = new Set<string>(JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]"));
    for (const key of [...sent]) {
      if (key.startsWith(`${taskId}:`)) sent.delete(key);
    }
    localStorage.setItem(SENT_KEY, JSON.stringify([...sent]));
  } catch {
    // ignore
  }
  const prev = snoozeTimers.get(taskId);
  if (prev) window.clearTimeout(prev);
  const timer = window.setTimeout(() => {
    snoozeTimers.delete(taskId);
    const current = getSnoozes();
    if (!current[taskId] || current[taskId] > Date.now() + 2_000) return;
    delete current[taskId];
    setSnoozes(current);
    if (document.visibilityState === "visible") {
      promptListener?.({ taskId, title, kind });
    }
    showSystemNotification(taskId, title, kind);
  }, SNOOZE_MS);
  snoozeTimers.set(taskId, timer);
}

function showSystemNotification(taskId: string, title: string, kind: ReminderPrompt["kind"]) {
  if (!("Notification" in window)) return;
  const heading =
    kind === "overdue" ? "Task overdue" : kind === "due" ? "Task due" : "Task reminder";
  closeSystemNotification(taskId);
  const n = new Notification(heading, {
    body: title,
    tag: `hollow-task-${taskId}`,
    requireInteraction: true,
  });
  openNotifications.set(taskId, n);
  n.onclick = () => {
    window.focus();
    openNotifications.delete(taskId);
    n.close();
    promptListener?.({ taskId, title, kind });
  };
}

export function notifyDueTasks(tasks: Task[]) {
  if (!remindersActive()) return;
  const sent = new Set<string>(JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]"));
  const snoozes = getSnoozes();
  const now = Date.now();
  let changed = false;
  const openIds = new Set<string>();

  for (const task of tasks.flatMap((t) => [t, ...(t.subtasks ?? [])])) {
    if (task.done) {
      dismissTaskNotification(task.id);
      if (snoozes[task.id]) {
        delete snoozes[task.id];
        changed = true;
      }
      continue;
    }
    openIds.add(task.id);
    if (!task.dueAt) continue;
    const due = new Date(task.dueAt).getTime();
    if (due > now) continue;

    const snoozeUntil = snoozes[task.id];
    if (snoozeUntil && snoozeUntil > now) continue;
    if (snoozeUntil) delete snoozes[task.id];

    // Only fire for tasks that became due recently — not the whole overdue
    // backlog the first time reminders get switched on.
    if (now - due > 6 * 60 * 60 * 1000 && !snoozeUntil) continue;
    const key = `${task.id}:${task.dueAt}`;
    if (sent.has(key) && !snoozeUntil) continue;

    const kind: ReminderPrompt["kind"] = now - due > 60_000 ? "overdue" : "due";
    const prompt = { taskId: task.id, title: task.title, kind };
    if (document.visibilityState === "visible") {
      promptListener?.(prompt);
    }
    showSystemNotification(task.id, task.title, kind);
    sent.add(key);
    changed = true;
  }

  for (const id of Object.keys(snoozes)) {
    if (!openIds.has(id)) delete snoozes[id];
  }
  setSnoozes(snoozes);
  if (changed) localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-300)));
}
