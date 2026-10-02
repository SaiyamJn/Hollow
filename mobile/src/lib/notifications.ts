import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";
import { setApiToken, updateTask } from "./api";
import { getSecureItem } from "./secureStorage";
import type { Task } from "./types";

const PREF_KEY = "hollow-notifications-enabled";
const FIRED_ONCE_KEY = "hollow-notif-fired-once";
const SNOOZE_KEY = "hollow-notif-snooze";

const CHANNEL_ID = "reminders";
/** No hyphens/colons — Expo category IDs break otherwise. */
export const TASK_CATEGORY = "taskreminder";
export const ACTION_COMPLETE = "complete";
export const ACTION_SNOOZE = "snooze";

const ACCENT = "#0cb879";
const SNOOZE_MS = 60 * 60 * 1000;

const TOKEN_KEY = "hollow-token";
const HANDLED_RESPONSE_KEY = "hollow-notif-handled-response";

export const BACKGROUND_NOTIFICATION_TASK = "hollow-background-notification-task";

// Dedup so Complete / Remind later is handled exactly once, whether it arrives
// through the foreground listener, `getLastNotificationResponseAsync`, or the
// background task. Shared across all three entry points.
let lastHandledResponse = "";
const inflightResponses = new Set<string>();

/**
 * Ensure the API has the stored auth token. The background task runs headless
 * (no React tree / auth context), so the token isn't already set there.
 */
async function ensureApiToken() {
  try {
    const token = await getSecureItem(TOKEN_KEY);
    if (token) setApiToken(token);
    return Boolean(token);
  } catch {
    return false;
  }
}

export async function completeTask(taskId: string) {
  // Always dismiss locally first so user sees instant feedback in the notification shade
  await dismissTaskNotifications(taskId);
  try {
    await ensureApiToken();
    await updateTask(taskId, { done: true });
  } catch {
    // If offline or network error, updateTask has queued it for sync
  }
}

/** Parse the response and run the right side effect once (Complete / Snooze / prompt). */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  onChanged?: () => void
) {
  const presentedId = response.notification?.request?.identifier;
  const action = response.actionIdentifier ?? "";
  const isComplete =
    action === ACTION_COMPLETE ||
    action.toLowerCase().includes("complete") ||
    action.endsWith(".complete");
  const isSnooze =
    action === ACTION_SNOOZE ||
    action.toLowerCase().includes("snooze") ||
    action.toLowerCase().includes("remind") ||
    action.endsWith(".snooze");

  // 1. Immediately clear the tapped notification from shade first so user sees instant feedback
  if (presentedId) {
    try {
      await Notifications.dismissNotificationAsync(presentedId);
    } catch {
      // ignore
    }
  }

  const key = `${presentedId}:${action}:${response.notification?.date ?? ""}`;
  if (inflightResponses.has(key) || (lastHandledResponse && lastHandledResponse === key)) {
    return;
  }
  inflightResponses.add(key);

  try {
    const storedLast = (await AsyncStorage.getItem(HANDLED_RESPONSE_KEY)) ?? "";
    if (storedLast === key) return;

    const prompt = promptFromNotification(
      response.notification?.request?.content as any,
      presentedId
    );

    const effectiveTaskId = prompt?.taskId ?? (presentedId ? presentedId.replace(/^hollowtask_/, "") : null);

    if (effectiveTaskId) {
      await dismissTaskNotifications(effectiveTaskId, presentedId);
    }

    if (isComplete) {
      if (effectiveTaskId) {
        await completeTask(effectiveTaskId);
      }
      lastHandledResponse = key;
      await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, key);
      emitTaskChange();
      onChanged?.();
      return;
    }

    if (isSnooze) {
      if (effectiveTaskId) {
        await snoozeTaskReminder(
          effectiveTaskId,
          prompt?.title ?? "Task",
          prompt?.kind ?? "reminder"
        );
      }
      lastHandledResponse = key;
      await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, key);
      emitTaskChange();
      onChanged?.();
      return;
    }

    // Tapping the card itself (default action) opens the in-app reminder prompt modal
    if (prompt) {
      emitReminderPrompt(prompt);
    }
  } finally {
    inflightResponses.delete(key);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }
}

// Runs when the user taps a notification action while the app is backgrounded
// or terminated (Android) — this is what makes Complete / Remind later work
// from the shade without opening the app.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (error || !data) return;
    let response: Notifications.NotificationResponse | null = null;
    if ("actionIdentifier" in data) {
      response = data as unknown as Notifications.NotificationResponse;
    } else if ("notification" in data && data.notification && "actionIdentifier" in (data.notification as any)) {
      response = data.notification as unknown as Notifications.NotificationResponse;
    }
    if (response) {
      await handleNotificationResponse(response);
    }
  }
);
// Register immediately at module load time so headless tasks work reliably
void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => undefined);

export type ReminderPrompt = {
  taskId: string;
  title: string;
  kind: "due" | "overdue" | "reminder";
};

type PromptListener = (prompt: ReminderPrompt) => void;
type ClearListener = (taskId: string) => void;
type TaskChangeListener = () => void;

let promptListener: PromptListener | null = null;
let clearListener: ClearListener | null = null;
const taskChangeListeners = new Set<TaskChangeListener>();

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

export function subscribeTaskChange(listener: TaskChangeListener) {
  taskChangeListeners.add(listener);
  return () => {
    taskChangeListeners.delete(listener);
  };
}

export function emitTaskChange() {
  taskChangeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

export function emitReminderPrompt(prompt: ReminderPrompt) {
  promptListener?.(prompt);
}

export function notificationIdForTask(taskId: string) {
  return `hollowtask_${taskId}`;
}

let boundNotificationResponse = false;

// Set default notification behavior at module load time so incoming notifications
// are presented immediately even if the app was backgrounded or cold-started.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export async function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
  await registerTaskCategory();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      showBadge: true,
      lightColor: ACCENT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  if (!boundNotificationResponse) {
    boundNotificationResponse = true;
    Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response);
    });
    void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => undefined);
  }
  void ensureNotificationPermissions();
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

/** Check if notifications are enabled, falling back to OS permission state if preference is unset. */
export async function getNotificationsEnabled(): Promise<boolean> {
  const pref = await AsyncStorage.getItem(PREF_KEY);
  if (pref === "false") return false;
  if (pref === "true") {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === "granted";
    } catch {
      return true;
    }
  }
  // If not explicitly set yet, check if system notification permission is granted
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") {
      await AsyncStorage.setItem(PREF_KEY, "true");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Ensure notification permissions are requested on first use if not explicitly disabled. */
export async function ensureNotificationPermissions(): Promise<boolean> {
  const pref = await AsyncStorage.getItem(PREF_KEY);
  if (pref === "false") return false;

  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") {
      await AsyncStorage.setItem(PREF_KEY, "true");
      return true;
    }
    if (current.canAskAgain || current.status === "undetermined") {
      const req = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
        android: {},
      });
      const granted = req.status === "granted";
      await AsyncStorage.setItem(PREF_KEY, granted ? "true" : "false");
      if (granted) {
        await registerTaskCategory();
      }
      return granted;
    }
  } catch {
    // ignore
  }
  return false;
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
    autoDismiss: true,
    vibrate: [0, 250, 250, 250],
    priority: "max",
    ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
  };
}

async function scheduleAt(date: Date, kind: ReminderPrompt["kind"], title: string, taskId: string) {
  if (date.getTime() <= Date.now()) {
    await scheduleIn(2, kind, title, taskId);
    return;
  }
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
          const content = n.request.content as any;
          const data = (content?.data ?? {}) as { taskId?: string };
          let dataTaskId = data.taskId;
          if (!dataTaskId && content?.dataString) {
            try {
              dataTaskId = JSON.parse(content.dataString)?.taskId;
            } catch {
              // ignore
            }
          }
          const ident = n.request.identifier;
          const blob = JSON.stringify(n.request.content ?? {});
          return (
            dataTaskId === taskId ||
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
 * - Recently overdue (within 6h) → notify once soon (tracked so we don't spam).
 * - Undated tasks and subtasks → never auto-notify (parents only).
 * - Done tasks → drop any leftover tray / scheduled notifications.
 */
export async function syncTaskReminders(tasks: Task[] | undefined) {
  let enabled = await getNotificationsEnabled();
  if (!enabled) {
    const pref = await AsyncStorage.getItem(PREF_KEY);
    if (pref !== "false") {
      enabled = await ensureNotificationPermissions();
    }
  }
  if (!enabled) return;
  if (!tasks) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      showBadge: true,
      lightColor: ACCENT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  await registerTaskCategory();

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = Date.now();
  const RECENT_OVERDUE_MS = 6 * 60 * 60 * 1000;
  const fired = await getFiredOnce();
  const snoozes = await getSnoozes();
  const stillNeedsOnce = new Set<string>();
  const openIds = new Set<string>();
  // Parents only — nested subtasks inherit the parent's reminder surface and
  // would otherwise spam the tray on every app open.
  const all = tasks.filter((t) => !t.parentTaskId);

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

    // No due date → no automatic reminder.
    if (!task.dueAt) continue;

    const due = reminderDate(new Date(task.dueAt));
    if (due.getTime() > now) {
      await scheduleAt(due, "due", task.title, task.id);
      continue;
    }

    // Already overdue: only nudge once if it became due recently (or was snoozed).
    const overdueFor = now - due.getTime();
    if (overdueFor > RECENT_OVERDUE_MS && !snoozeUntil) {
      // Stale backlog — remember so we don't suddenly fire later.
      fired.add(task.id);
      stillNeedsOnce.add(task.id);
      continue;
    }

    stillNeedsOnce.add(task.id);
    if (fired.has(task.id)) continue;
    await scheduleIn(2, "overdue", task.title, task.id);
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

export function promptFromNotification(
  content: {
    title?: string | null;
    body?: string | null;
    data?: Record<string, unknown> | string;
    dataString?: string;
  } | undefined | null,
  identifier?: string
): ReminderPrompt | null {
  if (!content && !identifier) return null;

  let data: Record<string, unknown> = {};

  if (content?.data && typeof content.data === "object") {
    data = content.data as Record<string, unknown>;
  } else if (typeof content?.data === "string") {
    try {
      data = JSON.parse(content.data);
    } catch {
      // ignore
    }
  }

  // Android background/headless tasks deliver stringified JSON in dataString
  if (!data.taskId && content?.dataString && typeof content.dataString === "string") {
    try {
      const parsed = JSON.parse(content.dataString);
      if (parsed && typeof parsed === "object") {
        data = { ...data, ...parsed };
      }
    } catch {
      // ignore
    }
  }

  let taskId = typeof data.taskId === "string" ? data.taskId : null;

  // Fallback: extract taskId from identifier (hollowtask_<taskId>)
  if (!taskId && identifier) {
    const match = identifier.match(/^hollowtask_(.+)$/);
    if (match) taskId = match[1];
  }

  if (!taskId) return null;

  const kind: ReminderPrompt["kind"] =
    data.kind === "due" || data.kind === "overdue" || data.kind === "reminder" ? data.kind : "reminder";
  const title =
    (typeof data.title === "string" && data.title) ||
    content?.body ||
    content?.title ||
    "Task";
  return { taskId, title, kind };
}
