import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import type { Task } from "./types";

const PREF_KEY = "hollow-notifications-enabled";
const FIRED_ONCE_KEY = "hollow-notif-fired-once";
const SNOOZE_KEY = "hollow-notif-snooze";

const CHANNEL_ID = "reminders";
/** No hyphens/colons — Expo category IDs break otherwise. */
export const TASK_CATEGORY = "taskreminder";
export const ACTION_COMPLETE = "complete";
export const ACTION_SNOOZE = "snooze";

const ACCENT = "#0e9f72";
const SNOOZE_MS = 60 * 60 * 1000;

export type ReminderPrompt = {
  taskId: string;
  title: string;
  kind: "due" | "overdue" | "reminder";
};

type PromptListener = (prompt: ReminderPrompt) => void;
type ClearListener = (taskId: string) => void;
let promptListener: PromptListener | null = null;
let clearListener: ClearListener | null = null;

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

export function emitReminderPrompt(prompt: ReminderPrompt) {
  promptListener?.(prompt);
}

export function notificationIdForTask(taskId: string) {
  return `hollowtask_${taskId}`;
}

let boundNotificationResponse = false;

export function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const inApp = AppState.currentState === "active";
      return {
        // In the foreground we show a Hollow popup instead of the system banner.
        shouldShowBanner: !inApp,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    },
  });
  void registerTaskCategory();
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      showBadge: false,
      lightColor: ACCENT,
    });
  }
  if (!boundNotificationResponse) {
    boundNotificationResponse = true;
    Notifications.addNotificationResponseReceivedListener((response) => {
      const prompt = promptFromNotification(response.notification.request.content);
      if (!prompt) return;
      void dismissTaskNotifications(prompt.taskId, response.notification.request.identifier);
    });
  }
}

async function registerTaskCategory() {
  await Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
    {
      identifier: ACTION_COMPLETE,
      buttonTitle: "Complete",
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: "Remind later",
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function getNotificationsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PREF_KEY)) === "true";
}

/** Returns the effective state (false if the OS permission was denied). */
export async function setNotificationsEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await AsyncStorage.setItem(PREF_KEY, "false");
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
    return false;
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
      android: {},
    });
    status = req.status;
  }
  const granted = status === "granted";
  await AsyncStorage.setItem(PREF_KEY, granted ? "true" : "false");
  if (!granted) {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } else {
    await registerTaskCategory();
  }
  return granted;
}

async function getFiredOnce(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(FIRED_ONCE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function setFiredOnce(ids: Set<string>) {
  await AsyncStorage.setItem(FIRED_ONCE_KEY, JSON.stringify([...ids]));
}

async function getSnoozes(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

async function setSnoozes(map: Record<string, number>) {
  await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

/** If due is midnight (date-only), remind at 9:00 local that day. */
function reminderDate(due: Date): Date {
  const d = new Date(due);
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function contentFor(kind: ReminderPrompt["kind"], title: string, taskId: string): Notifications.NotificationContentInput {
  const heading = kind === "overdue" ? "Task overdue" : kind === "due" ? "Task due" : "Task reminder";
  return {
    title: heading,
    subtitle: "Hollow",
    body: title,
    data: { taskId, kind, title },
    sound: "default",
    categoryIdentifier: TASK_CATEGORY,
    color: ACCENT,
    // Stay in the shade until Complete / Remind later / the task is checked off in-app.
    autoDismiss: false,
    ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
  };
}

async function scheduleAt(date: Date, kind: ReminderPrompt["kind"], title: string, taskId: string) {
  await Notifications.scheduleNotificationAsync({
    identifier: notificationIdForTask(taskId),
    content: contentFor(kind, title, taskId),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

async function scheduleIn(seconds: number, kind: ReminderPrompt["kind"], title: string, taskId: string) {
  await Notifications.scheduleNotificationAsync({
    identifier: notificationIdForTask(taskId),
    content: contentFor(kind, title, taskId),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(2, Math.round(seconds)),
      repeats: false,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

export async function dismissTaskNotifications(taskId: string, extraIdentifier?: string) {
  const id = notificationIdForTask(taskId);
  const ids = new Set([id, extraIdentifier].filter(Boolean) as string[]);
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // none scheduled
  }
  for (const ident of ids) {
    try {
      await Notifications.dismissNotificationAsync(ident);
    } catch {
      // not in tray
    }
  }
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => {
          const data = n.request.content.data as { taskId?: string } | undefined;
          const ident = n.request.identifier;
          const blob = JSON.stringify(n.request.content ?? {});
          return (
            data?.taskId === taskId ||
            ident === id ||
            (extraIdentifier && ident === extraIdentifier) ||
            ident.includes(taskId) ||
            blob.includes(taskId)
          );
        })
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier))
    );
  } catch {
    // older Android
  }
  clearListener?.(taskId);
}

export async function snoozeTaskReminder(taskId: string, title: string, kind: ReminderPrompt["kind"] = "reminder") {
  const until = Date.now() + SNOOZE_MS;
  const snoozes = await getSnoozes();
  snoozes[taskId] = until;
  await setSnoozes(snoozes);
  const fired = await getFiredOnce();
  if (fired.delete(taskId)) await setFiredOnce(fired);
  await dismissTaskNotifications(taskId);
  await scheduleAt(new Date(until), kind, title, taskId);
}

/**
 * Rebuild local reminders from the task list.
 * - Future due → notify at that moment (9am if date-only / midnight).
 * - Snoozed → notify at the snooze time.
 * - Past due / no due → notify once soon (tracked so we don't spam on every sync).
 * - Done tasks → drop any leftover tray / scheduled notifications.
 */
export async function syncTaskReminders(tasks: Task[] | undefined) {
  if (!(await getNotificationsEnabled())) return;
  if (!tasks) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      lightColor: ACCENT,
    });
  }
  await registerTaskCategory();

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = Date.now();
  const fired = await getFiredOnce();
  const snoozes = await getSnoozes();
  const stillNeedsOnce = new Set<string>();
  const openIds = new Set<string>();
  const all = tasks.flatMap((t) => [t, ...(t.subtasks ?? [])]);

  for (const task of all) {
    if (task.done) {
      await dismissTaskNotifications(task.id);
      delete snoozes[task.id];
      continue;
    }
    openIds.add(task.id);

    const snoozeUntil = snoozes[task.id];
    if (snoozeUntil && snoozeUntil > now) {
      await scheduleAt(new Date(snoozeUntil), "reminder", task.title, task.id);
      continue;
    }
    if (snoozeUntil) delete snoozes[task.id];

    if (task.dueAt) {
      const due = reminderDate(new Date(task.dueAt));
      if (due.getTime() > now) {
        await scheduleAt(due, "due", task.title, task.id);
        continue;
      }
      stillNeedsOnce.add(task.id);
      if (fired.has(task.id)) continue;
      await scheduleIn(2, "overdue", task.title, task.id);
      fired.add(task.id);
      continue;
    }

    stillNeedsOnce.add(task.id);
    if (fired.has(task.id)) continue;
    await scheduleIn(2, "reminder", task.title, task.id);
    fired.add(task.id);
  }

  for (const id of [...fired]) {
    if (!stillNeedsOnce.has(id)) fired.delete(id);
  }
  for (const id of Object.keys(snoozes)) {
    if (!openIds.has(id)) delete snoozes[id];
  }
  await setFiredOnce(fired);
  await setSnoozes(snoozes);
}

export function promptFromNotification(content: {
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
}): ReminderPrompt | null {
  const data = content.data ?? {};
  const taskId = typeof data.taskId === "string" ? data.taskId : null;
  if (!taskId) return null;
  const kind: ReminderPrompt["kind"] =
    data.kind === "due" || data.kind === "overdue" || data.kind === "reminder" ? data.kind : "reminder";
  const title =
    (typeof data.title === "string" && data.title) ||
    content.body ||
    content.title ||
    "Task";
  return { taskId, title, kind };
}
