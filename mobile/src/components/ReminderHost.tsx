import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useAuth } from "../contexts/auth";
import { fetchTasks } from "../lib/api";
import { getSocket } from "../lib/socket";
import {
  completeTask,
  dismissTaskNotifications,
  emitReminderPrompt,
  ensureNotificationPermissions,
  handleNotificationResponse,
  promptFromNotification,
  snoozeTaskReminder,
  subscribeReminderClear,
  subscribeReminderPrompt,
  subscribeTaskChange,
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

  // Real-time task synchronization across Web and Mobile
  useEffect(() => {
    if (status !== "signedIn") return;
    const socket = getSocket();
    const onTasksChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task-classes"] });
    };
    const onTaskDone = ({ taskId, done }: { taskId: string; done: boolean }) => {
      if (done) {
        void dismissTaskNotifications(taskId);
        setPrompt((cur) => (cur?.taskId === taskId ? null : cur));
      }
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    };

    socket.on("tasks:changed", onTasksChanged);
    socket.on("tasks:done", onTaskDone);

    return () => {
      socket.off("tasks:changed", onTasksChanged);
      socket.off("tasks:done", onTaskDone);
    };
  }, [status, queryClient]);

  useEffect(() => {
    if (status === "signedIn") {
      void ensureNotificationPermissions().then((enabled) => {
        if (enabled && tasks) void syncTaskReminders(tasks).catch(() => {});
      });
    }
  }, [status]);

  useEffect(() => {
    if (status === "signedIn" && tasks) void syncTaskReminders(tasks).catch(() => {});
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
    return subscribeTaskChange(() => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    });
  }, [queryClient]);

  useEffect(() => {
    if (status !== "signedIn") return;

    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (AppState.currentState !== "active") return;
      const next = promptFromNotification(notification.request.content, notification.request.identifier);
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
      if (next === "active") {
        flushLast();
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      }
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
