import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Task } from "./types";

const PREF_KEY = "hollow-notifications-enabled";
const FIRED_NO_DUE_KEY = "hollow-notif-fired-no-due";

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
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
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

async function getFiredNoDue(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(FIRED_NO_DUE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function setFiredNoDue(ids: Set<string>) {
  await AsyncStorage.setItem(FIRED_NO_DUE_KEY, JSON.stringify([...ids]));
}

/** If due is midnight (date-only), remind at 9:00 local that day. */
function reminderDate(due: Date): Date {
  const d = new Date(due);
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function androidContent() {
  return Platform.OS === "android" ? { channelId: CHANNEL_ID } : {};
}

/**
 * Rebuild local reminders from the task list.
 * - Has due date/time → notify at that moment (9am if date-only / midnight).
 * - No due date → notify once immediately (tracked so we don't spam on every sync).
 */
export async function syncTaskReminders(tasks: Task[] | undefined) {
  if (!(await getNotificationsEnabled())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!tasks) return;

  const now = Date.now();
  const fired = await getFiredNoDue();
  const stillOpenNoDue = new Set<string>();
  const all = tasks.flatMap((t) => [t, ...(t.subtasks ?? [])]);

  for (const task of all) {
    if (task.done) continue;

    if (task.dueAt) {
      const due = reminderDate(new Date(task.dueAt));
      if (due.getTime() <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Task due",
          body: task.title,
          data: { taskId: task.id },
          ...androidContent(),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: due,
        },
      });
      continue;
    }

    // No due date — notify once as soon as we see the open task.
    stillOpenNoDue.add(task.id);
    if (fired.has(task.id)) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "New task",
        body: task.title,
        data: { taskId: task.id },
        ...androidContent(),
      },
      trigger: null,
    });
    fired.add(task.id);
  }

  // Drop ids for tasks that are gone / completed / now have a due date.
  for (const id of [...fired]) {
    if (!stillOpenNoDue.has(id)) fired.delete(id);
  }
  await setFiredNoDue(fired);
}
