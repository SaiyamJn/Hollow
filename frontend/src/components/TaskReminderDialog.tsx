import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updateTask } from "../lib/api";
import {
  dismissTaskNotification,
  snoozeTaskReminder,
  subscribeReminderClear,
  subscribeReminderPrompt,
  type ReminderPrompt,
} from "../lib/notify";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

export function TaskReminderDialog() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState<ReminderPrompt | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeReminderPrompt(setPrompt), []);
  useEffect(
    () =>
      subscribeReminderClear((taskId) => {
        setPrompt((current) => (current?.taskId === taskId ? null : current));
      }),
    []
  );

  async function onComplete() {
    if (!prompt) return;
    setBusy(true);
    try {
      await updateTask(prompt.taskId, { done: true });
      // Close the system notification + clear the in-app prompt immediately so
      // completing from the notification center doesn't leave it lingering.
      dismissTaskNotification(prompt.taskId);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch {
      // Even if the API call fails, dismiss the notification so it doesn't linger.
      dismissTaskNotification(prompt.taskId);
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  }

  function onSnooze() {
    if (!prompt) return;
    try {
      snoozeTaskReminder(prompt.taskId, prompt.title, prompt.kind);
    } finally {
      setPrompt(null);
    }
  }

  const heading =
    prompt?.kind === "overdue" ? "Task overdue" : prompt?.kind === "due" ? "Task due" : "Reminder";

  if (!prompt) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && setPrompt(null)}>
      <DialogContent title={heading}>
        <p className="text-sm text-primary text-center font-medium">{prompt?.title}</p>
        <p className="text-xs text-secondary text-center mt-2">
          Complete it now, or I’ll nudge you again in an hour.
        </p>
        <div className="flex gap-2 mt-5">
          <Button className="flex-1" onClick={onSnooze} disabled={busy}>
            Remind later
          </Button>
          <Button className="flex-1" variant="accent" onClick={() => void onComplete()} disabled={busy}>
            {busy ? "…" : "Complete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
