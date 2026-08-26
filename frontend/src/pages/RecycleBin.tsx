import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckSquare, RotateCcw, StickyNote, Trash2 } from "lucide-react";
import {
  deleteQuickNotePermanent,
  deleteTaskPermanent,
  fetchQuickNotes,
  fetchTrashedTasks,
  restoreQuickNote,
  restoreTask,
} from "../lib/api";
import type { QuickNote, Task } from "../lib/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button } from "../components/ui/button";
import { Link } from "react-router-dom";
import { shouldHandleItemDelete } from "../lib/keys";
import clsx from "clsx";

function daysLeft(deletedAt?: string | null) {
  if (!deletedAt) return 7;
  const ms = new Date(deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

type Tab = "notes" | "tasks";

export default function RecycleBin() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("notes");
  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ["quicknotes", "trash"],
    queryFn: () => fetchQuickNotes(false, true),
  });
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", "trash"],
    queryFn: fetchTrashedTasks,
  });

  const invalidateNotes = () => {
    void queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  };
  const invalidateTasks = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const restoreNote = useMutation({
    mutationFn: restoreQuickNote,
    onSuccess: invalidateNotes,
  });
  const purgeNote = useMutation({
    mutationFn: deleteQuickNotePermanent,
    onSuccess: invalidateNotes,
  });
  const emptyNotes = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteQuickNotePermanent(id)));
    },
    onSuccess: invalidateNotes,
  });

  const restoreTaskMut = useMutation({
    mutationFn: restoreTask,
    onSuccess: invalidateTasks,
  });
  const purgeTask = useMutation({
    mutationFn: deleteTaskPermanent,
    onSuccess: invalidateTasks,
  });
  const emptyTasks = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteTaskPermanent(id)));
    },
    onSuccess: invalidateTasks,
  });

  const noteList = notes ?? [];
  const taskList = tasks ?? [];
  const list = tab === "notes" ? noteList : taskList;
  const isLoading = tab === "notes" ? notesLoading : tasksLoading;

  const [confirm, setConfirm] = useState<
    | { kind: "empty" }
    | { kind: "purge"; id: string }
    | null
  >(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!shouldHandleItemDelete(e) || !hoverId) return;
      e.preventDefault();
      setConfirm({ kind: "purge", id: hoverId });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hoverId]);

  return (
    <div className="max-w-2xl mx-auto px-7 py-10 space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-medium">Recycle bin</h1>
        <p className="text-sm text-secondary mt-1">
          Notes and tasks stay here for 7 days, then they’re gone for good.
        </p>
        <div className="mt-2 flex justify-center gap-3 text-sm">
          <Link to="/quick-notes" className="text-accent hover:underline">
            ← Notes
          </Link>
          <Link to="/tasks" className="text-accent hover:underline">
            ← Tasks
          </Link>
        </div>
      </div>

      <div className="flex justify-center gap-1 p-1 rounded-xl border border-border glass-strong w-fit mx-auto shadow-card">
        {(
          [
            { id: "notes" as const, label: "Notes", count: noteList.length },
            { id: "tasks" as const, label: "Tasks", count: taskList.length },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              tab === t.id
                ? "bg-accent text-surface-0 shadow-sm"
                : "text-secondary hover:text-primary hover:bg-surface-2/80"
            )}
          >
            {t.label}
            {t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {list.length > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" disabled={emptyNotes.isPending || emptyTasks.isPending} onClick={() => setConfirm({ kind: "empty" })}>
            Empty {tab}
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-secondary text-center py-8">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">
          {tab === "notes" ? "No notes in the recycle bin." : "No tasks in the recycle bin."}
        </p>
      ) : tab === "notes" ? (
        <ul className="rounded-xl border border-border glass shadow-card divide-y divide-[var(--border)]">
          {noteList.map((note) => (
            <NoteTrashRow
              key={note.id}
              note={note}
              busy={restoreNote.isPending || purgeNote.isPending}
              onRestore={() => restoreNote.mutate(note.id)}
              onPurge={() => setConfirm({ kind: "purge", id: note.id })}
              onHover={() => setHoverId(note.id)}
            />
          ))}
        </ul>
      ) : (
        <ul className="rounded-xl border border-border glass shadow-card divide-y divide-[var(--border)]">
          {taskList.map((task) => (
            <TaskTrashRow
              key={task.id}
              task={task}
              busy={restoreTaskMut.isPending || purgeTask.isPending}
              onRestore={() => restoreTaskMut.mutate(task.id)}
              onPurge={() => setConfirm({ kind: "purge", id: task.id })}
              onHover={() => setHoverId(task.id)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "empty" ? `Empty ${tab}?` : "Delete forever?"}
        message={
          confirm?.kind === "empty"
            ? `Permanently delete ${list.length} ${tab === "notes" ? "note" : "task"}${list.length === 1 ? "" : "s"}? This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel={confirm?.kind === "empty" ? "Empty" : "Delete"}
        confirmBusy={
          emptyNotes.isPending || emptyTasks.isPending || purgeNote.isPending || purgeTask.isPending
        }
        onConfirm={() => {
          if (confirm?.kind === "empty") {
            if (tab === "notes") emptyNotes.mutate(noteList.map((n) => n.id));
            else emptyTasks.mutate(taskList.map((t) => t.id));
          } else if (confirm?.kind === "purge") {
            if (tab === "notes") purgeNote.mutate(confirm.id);
            else purgeTask.mutate(confirm.id);
          }
          setConfirm(null);
        }}
      />
    </div>
  );
}

function NoteTrashRow({
  note,
  busy,
  onRestore,
  onPurge,
  onHover,
}: {
  note: QuickNote;
  busy: boolean;
  onRestore: () => void;
  onPurge: () => void;
  onHover: () => void;
}) {
  const title = note.title?.trim() || (note.kind === "list" ? "List" : "Note");
  const preview =
    note.kind === "list"
      ? `${(note.items ?? []).filter((i) => i.text.trim()).length} items`
      : note.content.trim().slice(0, 80) || "Empty";
  const left = daysLeft(note.deletedAt);

  return (
    <li className="flex items-center gap-3 px-4 py-3" onMouseEnter={onHover}>
      <StickyNote size={15} className="text-secondary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary truncate">{title}</p>
        <p className="text-xs text-secondary truncate mt-0.5">
          {preview} · {left}d left
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        title="Restore"
        onClick={onRestore}
        className="p-1.5 rounded-md text-secondary hover:text-accent disabled:opacity-50"
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        disabled={busy}
        title="Delete forever"
        onClick={onPurge}
        className="p-1.5 rounded-md text-secondary hover:text-danger disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}

function TaskTrashRow({
  task,
  busy,
  onRestore,
  onPurge,
  onHover,
}: {
  task: Task;
  busy: boolean;
  onRestore: () => void;
  onPurge: () => void;
  onHover: () => void;
}) {
  const left = daysLeft(task.deletedAt);
  const subCount = task.subtasks?.length ?? 0;

  return (
    <li className="flex items-center gap-3 px-4 py-3" onMouseEnter={onHover}>
      <CheckSquare size={15} className="text-secondary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary truncate">{task.title}</p>
        <p className="text-xs text-secondary truncate mt-0.5">
          {subCount > 0 ? `${subCount} subtask${subCount === 1 ? "" : "s"} · ` : ""}
          {left}d left
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        title="Restore"
        onClick={onRestore}
        className="p-1.5 rounded-md text-secondary hover:text-accent disabled:opacity-50"
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        disabled={busy}
        title="Delete forever"
        onClick={onPurge}
        className="p-1.5 rounded-md text-secondary hover:text-danger disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}
