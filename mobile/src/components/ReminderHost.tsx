import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useAuth } from "../contexts/auth";
import { fetchTasks } from "../lib/api";
import {
  completeTask,
  dismissTaskNotifications,
  emitReminderPrompt,
  handleNotificationResponse,
  promptFromNotification,
  snoozeTaskReminder,
  subscribeReminderClear,
  subscribeReminderPrompt,
  syncTaskReminders,
  type ReminderPrompt,
} from "../lib/notifications";
import { TaskReminderModal } from "./TaskReminderModal";

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
      void handleNotificationResponse(response, () => {
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      });
    });

    const flushLast = () => {
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        void handleNotificationResponse(response, () => {
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
    } catch {
      // Even if the API call fails, dismiss the notification so it doesn't linger.
      await dismissTaskNotifications(prompt.taskId);
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  }

  async function onSnooze() {
    if (!prompt) return;
    setBusy(true);
    try {
      await snoozeTaskReminder(prompt.taskId, prompt.title, prompt.kind);
    } finally {
      setPrompt(null);
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
