import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Task } from "./types";

const PREF_KEY = "hollow-notifications-enabled";
const FIRED_ONCE_KEY = "hollow-notif-fired-once";

const CHANNEL_ID = "reminders";

export function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      showBadge: false,
    });
  }
}

export async function getNotificationsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PREF_KEY)) === "true";
}

/** Returns the effective state (false if the OS permission was denied). */
export async function setNotificationsEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await AsyncStorage.setItem(PREF_KEY, "false");
    await Notifications.cancelAllScheduledNotificationsAsync();
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

/** If due is midnight (date-only), remind at 9:00 local that day. */
function reminderDate(due: Date): Date {
  const d = new Date(due);
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

async function scheduleAt(date: Date, title: string, body: string, taskId: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { taskId },
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

async function scheduleNow(title: string, body: string, taskId: string) {
  // Small delay so Android shows it reliably after scheduling.
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { taskId },
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

/**
 * Rebuild local reminders from the task list.
 * - Future due → notify at that moment (9am if date-only / midnight).
 * - Past due / no due → notify once soon (tracked so we don't spam on every sync).
 */
export async function syncTaskReminders(tasks: Task[] | undefined) {
  if (!(await getNotificationsEnabled())) return;

  // Ensure channel exists before scheduling (Android).
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!tasks) return;

  const now = Date.now();
  const fired = await getFiredOnce();
  const stillNeedsOnce = new Set<string>();
  const all = tasks.flatMap((t) => [t, ...(t.subtasks ?? [])]);

  for (const task of all) {
    if (task.done) continue;

    if (task.dueAt) {
      const due = reminderDate(new Date(task.dueAt));
      if (due.getTime() > now) {
        await scheduleAt(due, "Task due", task.title, task.id);
        continue;
      }
      // Already past due — one-shot reminder so it isn't silently skipped.
      stillNeedsOnce.add(task.id);
      if (fired.has(task.id)) continue;
      await scheduleNow("Task overdue", task.title, task.id);
      fired.add(task.id);
      continue;
    }

    // No due date — notify once shortly after we first see the open task.
    stillNeedsOnce.add(task.id);
    if (fired.has(task.id)) continue;
    await scheduleNow("Task reminder", task.title, task.id);
    fired.add(task.id);
  }

  for (const id of [...fired]) {
    if (!stillNeedsOnce.has(id)) fired.delete(id);
  }
  await setFiredOnce(fired);
}
