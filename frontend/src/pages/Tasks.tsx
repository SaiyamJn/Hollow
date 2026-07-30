import { KeyboardEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createTask, deleteTask, fetchTasks, updateTask } from "../lib/api";
import type { Task } from "../lib/types";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";

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

// Local-time value for <input type="datetime-local"> (ISO strings are UTC).
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDueLocal() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

function formatDue(iso: string) {
  const due = new Date(iso);
  const date = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  return hasTime ? `${date}, ${due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : date;
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

type Draft = { title: string; description: string; dueLocal: string };

export default function Tasks() {
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

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
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });

  function openCreate(title: string) {
    setDraft({ title: title.trim(), description: "", dueLocal: defaultDueLocal() });
  }

  function onQuickAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && quickAdd.trim()) openCreate(quickAdd);
  }

  function submitDraft() {
    if (!draft?.title.trim() || create.isPending) return;
    create.mutate({
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      dueAt: draft.dueLocal ? new Date(draft.dueLocal).toISOString() : undefined,
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-7 py-10">
      <h1 className="text-xl font-medium mb-5">Tasks</h1>

      <Input
        placeholder="Add a task, press Enter"
        value={quickAdd}
        onChange={(e) => setQuickAdd(e.target.value)}
        onKeyDown={onQuickAdd}
        className="mb-6"
      />

      {tasks && tasks.length === 0 && <p className="text-sm text-secondary">No tasks yet.</p>}

      <div className="space-y-6">
        {groupTasks(tasks ?? []).map(([name, list]) => (
          <section key={name}>
            <h2
              className={clsx("text-xs font-medium uppercase tracking-wide mb-2", {
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
                  onAddSubtask={(title) => create.mutate({ title, parentTaskId: task.id })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent title="New task">
          {draft && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px]"
                placeholder="Description (optional)"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <div className="space-y-1.5">
                <label className="text-xs text-secondary">Due date & time</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-border glass-input px-3 py-1.5 text-sm text-primary
                             focus:outline-none focus:border-accent"
                  value={draft.dueLocal}
                  onChange={(e) => setDraft({ ...draft, dueLocal: e.target.value })}
                />
              </div>
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
    </div>
  );
}

function TaskRow({
  task,
  onPatch,
  onDelete,
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
  onAddSubtask: (title: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [descDraft, setDescDraft] = useState(task.description ?? "");
  const subtasks = task.subtasks ?? [];

  function onSubtaskKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && subtaskDraft.trim()) {
      onAddSubtask(subtaskDraft.trim());
      setSubtaskDraft("");
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="group flex items-center gap-2.5">
        <button className="text-secondary hover:text-primary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Checkbox checked={task.done} onToggle={() => onPatch(task.id, { done: !task.done })} />
        <div className="flex-1 min-w-0">
          <span className={clsx("block text-sm truncate", task.done && "line-through text-secondary")}>
            {task.title}
          </span>
          {task.description ? (
            <span className="block text-xs text-secondary truncate mt-0.5">{task.description}</span>
          ) : null}
        </div>
        {task.dueAt && <span className="text-xs text-secondary shrink-0">{formatDue(task.dueAt)}</span>}
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
          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs text-secondary">Due</label>
            <input
              type="datetime-local"
              className="bg-transparent glass-input border border-border rounded-md px-2 py-0.5 text-xs text-primary focus:outline-none focus:border-accent"
              value={task.dueAt ? toLocalInput(task.dueAt) : ""}
              onChange={(e) =>
                onPatch(task.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
            />
            {task.dueAt && (
              <button className="text-xs text-secondary hover:text-primary" onClick={() => onPatch(task.id, { dueAt: null })}>
                Clear
              </button>
            )}
          </div>
          <textarea
            className="w-full bg-transparent text-xs text-primary placeholder:text-secondary focus:outline-none resize-none min-h-[48px] border border-border rounded-md px-2 py-1.5 glass-input"
            placeholder="Description"
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              if (descDraft !== (task.description ?? "")) onPatch(task.id, { description: descDraft });
            }}
          />
        </div>
      )}
    </div>
  );
}
