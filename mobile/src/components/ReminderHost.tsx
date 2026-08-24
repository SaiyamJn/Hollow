import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useAuth } from "../contexts/auth";
import { fetchTasks, updateTask } from "../lib/api";
import {
  ACTION_COMPLETE,
  ACTION_SNOOZE,
  dismissTaskNotifications,
  emitReminderPrompt,
  promptFromNotification,
  snoozeTaskReminder,
  subscribeReminderClear,
  subscribeReminderPrompt,
  syncTaskReminders,
  type ReminderPrompt,
} from "../lib/notifications";
import { TaskReminderModal } from "./TaskReminderModal";

async function completeTask(taskId: string) {
  await updateTask(taskId, { done: true });
  await dismissTaskNotifications(taskId);
}

const HANDLED_RESPONSE_KEY = "hollow-notif-handled-response";

export function ReminderHost() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState<ReminderPrompt | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
    enabled: status === "signedIn",
    staleTime: 30_000,
  });

  useEffect(() => {
    if (status === "signedIn" && tasks) void syncTaskReminders(tasks);
  }, [status, tasks]);

  useEffect(() => subscribeReminderPrompt(setPrompt), []);
  useEffect(
    () =>
      subscribeReminderClear((taskId) => {
        setPrompt((current) => (current?.taskId === taskId ? null : current));
      }),
    []
  );

  useEffect(() => {
    if (status !== "signedIn") return;

    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (AppState.currentState !== "active") return;
      const next = promptFromNotification(notification.request.content);
      if (next) emitReminderPrompt(next);
    });

    const responded = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response, () => {
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      });
    });

    const flushLast = () => {
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        void handleResponse(response, () => {
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        });
      });
    };
    flushLast();
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") flushLast();
    });

    return () => {
      received.remove();
      responded.remove();
      appState.remove();
    };
  }, [status, queryClient]);

  async function onComplete() {
    if (!prompt) return;
    setBusy(true);
    try {
      await completeTask(prompt.taskId);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setPrompt(null);
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  async function onSnooze() {
    if (!prompt) return;
    setBusy(true);
    try {
      await snoozeTaskReminder(prompt.taskId, prompt.title, prompt.kind);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TaskReminderModal
      prompt={prompt}
      busy={busy}
      onComplete={() => void onComplete()}
      onSnooze={() => void onSnooze()}
      onDismiss={() => setPrompt(null)}
    />
  );
}

let lastHandledResponse = "";
const inflightResponses = new Set<string>();

async function handleResponse(
  response: Notifications.NotificationResponse,
  onChanged: () => void
) {
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
  if (inflightResponses.has(key) || lastHandledResponse === key) return;
  inflightResponses.add(key);

  try {
    if (!lastHandledResponse) {
      lastHandledResponse = (await AsyncStorage.getItem(HANDLED_RESPONSE_KEY)) ?? "";
      if (lastHandledResponse === key) return;
    }
    lastHandledResponse = key;
    await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, key);

    const prompt = promptFromNotification(response.notification.request.content);
    if (!prompt) return;
    const presentedId = response.notification.request.identifier;
    const action = response.actionIdentifier;
    if (action === ACTION_COMPLETE) {
      await dismissTaskNotifications(prompt.taskId, presentedId);
      await completeTask(prompt.taskId);
      onChanged();
      return;
    }
    if (action === ACTION_SNOOZE) {
      await dismissTaskNotifications(prompt.taskId, presentedId);
      await snoozeTaskReminder(prompt.taskId, prompt.title, prompt.kind);
      return;
    }
    emitReminderPrompt(prompt);
  } finally {
    void Notifications.clearLastNotificationResponseAsync();
  }
}
