import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Task } from "./types";

const PREF_KEY = "hollow-notifications-enabled";

export function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync("reminders", {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
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
  const { status } = await Notifications.requestPermissionsAsync();
  const granted = status === "granted";
  await AsyncStorage.setItem(PREF_KEY, granted ? "true" : "false");
  return granted;
}

// Rebuild the whole local schedule from the current task list. Cancel-all +
// re-schedule keeps this idempotent — no per-task bookkeeping to drift.
export async function syncTaskReminders(tasks: Task[] | undefined) {
  if (!(await getNotificationsEnabled())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!tasks) return;

  const now = Date.now();
  const all = tasks.flatMap((t) => [t, ...(t.subtasks ?? [])]);
  for (const task of all) {
    if (task.done || !task.dueAt) continue;
    const due = new Date(task.dueAt);
    if (due.getTime() <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Task due",
        body: task.title,
        ...(Platform.OS === "android" ? { channelId: "reminders" } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due },
    });
  }
}
