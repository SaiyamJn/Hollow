import { KeyboardEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createTask, deleteTask, fetchTasks, updateTask } from "../lib/api";
import type { Task } from "../lib/types";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { DateTimePicker, formatDueLabel } from "../components/DateTimePicker";

type GroupName = "Starred" | "Overdue" | "Today" | "Upcoming" | "No date";

function groupTasks(tasks: Task[]): [GroupName, Task[]][] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const starred = tasks.filter((t) => t.starred);
  const rest = tasks.filter((t) => !t.starred);

  const groups: Record<Exclude<GroupName, "Starred">, Task[]> = {
    Overdue: [],
    Today: [],
    Upcoming: [],
    "No date": [],
  };
  for (const task of rest) {
    if (!task.dueAt) groups["No date"].push(task);
    else {
      const due = new Date(task.dueAt);
      if (due < startOfToday) groups.Overdue.push(task);
      else if (due < endOfToday) groups.Today.push(task);
      else groups.Upcoming.push(task);
    }
  }

  const ordered: [GroupName, Task[]][] = [];
  if (starred.length) ordered.push(["Starred", starred]);
  for (const name of ["Overdue", "Today", "Upcoming", "No date"] as const) {
    if (groups[name].length) ordered.push([name, groups[name]]);
  }
  return ordered;
}

function defaultDue() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors",
        checked ? "bg-accent border-accent text-surface-0" : "border-border hover:border-secondary"
      )}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

type Draft = { title: string; description: string; due: Date | null };
type EditDraft = Draft & { id: string };

export default function Tasks() {
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);

  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      invalidate();
      setDraft(null);
      setQuickAdd("");
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        title?: string;
        description?: string;
        done?: boolean;
        starred?: boolean;
        dueAt?: string | null;
      };
    }) => updateTask(id, patch),
    onSuccess: invalidate,
  });
  const saveEdit = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { title: string; description: string; dueAt: string | null };
    }) => updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });

  function openCreate(title: string) {
    setDraft({ title: title.trim(), description: "", due: defaultDue() });
  }

  function onQuickAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && quickAdd.trim()) openCreate(quickAdd);
  }

  function submitDraft() {
    if (!draft?.title.trim() || create.isPending) return;
    create.mutate({
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      dueAt: draft.due ? draft.due.toISOString() : undefined,
    });
  }

  function submitEdit() {
    if (!editing?.title.trim() || saveEdit.isPending) return;
    saveEdit.mutate({
      id: editing.id,
      patch: {
        title: editing.title.trim(),
        description: editing.description.trim(),
        dueAt: editing.due ? editing.due.toISOString() : null,
      },
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-7 py-10">
      <div className="text-center mb-6">
        <h1 className="text-xl font-medium">Tasks</h1>
        <p className="text-sm text-secondary mt-1">Star what matters — due dates keep you honest.</p>
      </div>

      <Input
        placeholder="Add a task, press Enter"
        value={quickAdd}
        onChange={(e) => setQuickAdd(e.target.value)}
        onKeyDown={onQuickAdd}
        className="mb-6 text-center"
      />

      {tasks && tasks.length === 0 && (
        <p className="text-sm text-secondary text-center">No tasks yet.</p>
      )}

      <div className="space-y-6">
        {groupTasks(tasks ?? []).map(([name, list]) => (
          <section key={name}>
            <h2
              className={clsx("text-xs font-medium uppercase tracking-wide mb-2 text-center", {
                "text-accent": name === "Starred" || name === "Today",
                "text-danger": name === "Overdue",
                "text-secondary": name === "Upcoming" || name === "No date",
              })}
            >
              {name}
            </h2>
            <div className="rounded-xl border border-border glass shadow-card divide-y divide-[var(--border)] overflow-hidden">
              {list.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onPatch={(id, patch) => update.mutate({ id, patch })}
                  onDelete={(id) => remove.mutate(id)}
                  onEdit={() =>
                    setEditing({
                      id: task.id,
                      title: task.title,
                      description: task.description ?? "",
                      due: task.dueAt ? new Date(task.dueAt) : null,
                    })
                  }
                  onAddSubtask={(title) => create.mutate({ title, parentTaskId: task.id })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent title="New task" className="max-w-md">
          {draft && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="text-center"
              />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px] text-center"
                placeholder="Description (optional)"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <DateTimePicker value={draft.due} onChange={(due) => setDraft({ ...draft, due })} />
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={!draft.title.trim() || create.isPending}
                  onClick={submitDraft}
                >
                  {create.isPending ? "Adding…" : "Add task"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit task" className="max-w-md">
          {editing && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Title"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="text-center"
              />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px] text-center"
                placeholder="Description (optional)"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <DateTimePicker value={editing.due} onChange={(due) => setEditing({ ...editing, due })} />
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={!editing.title.trim() || saveEdit.isPending}
                  onClick={submitEdit}
                >
                  {saveEdit.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({
  task,
  onPatch,
  onDelete,
  onEdit,
  onAddSubtask,
}: {
  task: Task;
  onPatch: (
    id: string,
    patch: {
      title?: string;
      description?: string;
      done?: boolean;
      starred?: boolean;
      dueAt?: string | null;
    }
  ) => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
  onAddSubtask: (title: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const subtasks = task.subtasks ?? [];

  function onSubtaskKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && subtaskDraft.trim()) {
      onAddSubtask(subtaskDraft.trim());
      setSubtaskDraft("");
    }
  }

  return (
    <div className="px-3.5 py-2.5">
      <div className="group flex items-center gap-2.5">
        <button className="text-secondary hover:text-primary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Checkbox checked={task.done} onToggle={() => onPatch(task.id, { done: !task.done })} />
        <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
          <span className={clsx("block text-sm truncate", task.done && "line-through text-secondary")}>
            {task.title}
          </span>
          {task.description ? (
            <span className="block text-xs text-secondary truncate mt-0.5">{task.description}</span>
          ) : null}
          {task.dueAt ? (
            <span className="block text-xs text-secondary mt-0.5">{formatDueLabel(task.dueAt)}</span>
          ) : null}
        </button>
        {subtasks.length > 0 && (
          <span className="text-xs text-secondary shrink-0">
            {subtasks.filter((s) => s.done).length}/{subtasks.length}
          </span>
        )}
        <button
          title={task.starred ? "Unstar" : "Star"}
          className={clsx(
            "shrink-0",
            task.starred ? "text-accent" : "text-secondary opacity-0 group-hover:opacity-100 hover:text-primary"
          )}
          onClick={() => onPatch(task.id, { starred: !task.starred })}
        >
          <Star size={14} fill={task.starred ? "currentColor" : "none"} />
        </button>
        <button
          title="Edit"
          className="text-secondary opacity-0 group-hover:opacity-100 hover:text-primary"
          onClick={onEdit}
        >
          <Pencil size={14} />
        </button>
        <button
          title="Delete"
          className="text-secondary opacity-0 group-hover:opacity-100 hover:text-primary"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="ml-10 mt-2 space-y-1.5">
          {subtasks.map((sub) => (
            <div key={sub.id} className="group flex items-center gap-2.5">
              <Checkbox checked={sub.done} onToggle={() => onPatch(sub.id, { done: !sub.done })} />
              <span className={clsx("flex-1 text-sm truncate", sub.done && "line-through text-secondary")}>
                {sub.title}
              </span>
              <button
                title="Delete subtask"
                className="text-secondary opacity-0 group-hover:opacity-100 hover:text-primary"
                onClick={() => onDelete(sub.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2.5">
            <Plus size={13} className="text-secondary" />
            <input
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-secondary"
              placeholder="Add subtask"
              value={subtaskDraft}
              onChange={(e) => setSubtaskDraft(e.target.value)}
              onKeyDown={onSubtaskKey}
            />
          </div>
        </div>
      )}
    </div>
  );
}
