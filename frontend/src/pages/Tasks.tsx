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
import { formatRepeatLabel } from "../lib/taskRepeat";
import type { TaskRepeatRule } from "../lib/types";
import { RepeatField, repeatPayload } from "../components/RepeatPanel";
import type { RepeatEnd } from "../lib/taskRepeat";

type GroupName = "Starred" | "Overdue" | "Today" | "Upcoming" | "No date";

/** Next occurrence of a repeat stays off Tasks (incl. Upcoming) until its day starts.
 *  One-off future tasks still appear under Upcoming. */
function isDeferredRepeat(task: Task, endOfToday: Date) {
  if (task.done || !task.repeatRule || !task.dueAt) return false;
  return new Date(task.dueAt) >= endOfToday;
}

function groupOpenTasks(tasks: Task[]): [GroupName, Task[]][] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const open = tasks.filter((t) => !t.done && !isDeferredRepeat(t, endOfToday));
  const starred = open.filter((t) => t.starred);
  const rest = open.filter((t) => !t.starred);

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

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-all duration-300",
        checked ? "bg-accent border-accent text-surface-0 scale-95" : "border-border hover:border-secondary"
      )}
    >
      {checked && <Check size={11} strokeWidth={3} className="animate-fade-in" />}
    </button>
  );
}

type Draft = {
  title: string;
  description: string;
  due: Date | null;
  repeat: TaskRepeatRule | null;
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: RepeatEnd | null;
  repeatUntil?: Date | null;
  repeatCount?: number | null;
};
type EditDraft = Draft & { id: string };

export default function Tasks() {
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

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
  const createSubtask = useMutation({
    mutationFn: createTask,
    onSuccess: invalidate,
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
      patch: {
        title: string;
        description: string;
        dueAt: string | null;
        repeatRule?: TaskRepeatRule | null;
        repeatDays?: number[] | null;
        repeatInterval?: number | null;
        repeatEnd?: RepeatEnd | null;
        repeatUntil?: string | null;
        repeatCount?: number | null;
      };
    }) => updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });

  function openCreate(title: string) {
    setDraft({
      title: title.trim(),
      description: "",
      due: null,
      repeat: null,
      repeatDays: null,
      repeatInterval: 1,
      repeatEnd: null,
      repeatUntil: null,
      repeatCount: null,
    });
    create.reset();
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
      ...repeatPayload(draft),
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
        ...repeatPayload(editing),
      },
    });
  }

  const createError =
    (create.error as any)?.response?.data?.error ?? (create.error ? "Couldn't add task." : null);
  const editError =
    (saveEdit.error as any)?.response?.data?.error ?? (saveEdit.error ? "Couldn't save." : null);

  const openGroups = groupOpenTasks(tasks ?? []);
  const completed = (tasks ?? []).filter((t) => t.done);

  return (
    <div className="max-w-2xl mx-auto px-7 py-10">
      <div className="text-center mb-6">
        <h1 className="text-xl font-medium">Tasks</h1>
        <p className="text-sm text-secondary mt-1">Star the important bits — dates keep you honest.</p>
      </div>

      <Input
        placeholder="What's next? Press Enter"
        value={quickAdd}
        onChange={(e) => setQuickAdd(e.target.value)}
        onKeyDown={onQuickAdd}
        className="mb-6 text-center"
      />

      {tasks && tasks.length === 0 && (
        <p className="text-sm text-secondary text-center">Nothing on the list yet — whenever you're ready.</p>
      )}

      <div className="space-y-6">
        {openGroups.map(([name, list]) => (
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
                  onEdit={() => {
                    saveEdit.reset();
                    setEditing({
                      id: task.id,
                      title: task.title,
                      description: task.description ?? "",
                      due: task.dueAt ? new Date(task.dueAt) : null,
                      repeat: task.repeatRule ?? null,
                      repeatDays: task.repeatDays ?? null,
                      repeatInterval: task.repeatInterval ?? 1,
                      repeatEnd: task.repeatEnd ?? null,
                      repeatUntil: task.repeatUntil ? new Date(task.repeatUntil) : null,
                      repeatCount: task.repeatCount ?? null,
                    });
                  }}
                  onAddSubtask={(title) => createSubtask.mutate({ title, parentTaskId: task.id })}
                />
              ))}
            </div>
          </section>
        ))}

        {completed.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide
                         text-secondary hover:text-primary mb-2 py-1"
            >
              {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="rounded-xl border border-border glass shadow-card divide-y divide-[var(--border)] overflow-hidden">
                {completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onPatch={(id, patch) => update.mutate({ id, patch })}
                    onDelete={(id) => remove.mutate(id)}
                    onEdit={() => {
                      saveEdit.reset();
                      setEditing({
                        id: task.id,
                        title: task.title,
                        description: task.description ?? "",
                        due: task.dueAt ? new Date(task.dueAt) : null,
                        repeat: task.repeatRule ?? null,
                        repeatDays: task.repeatDays ?? null,
                        repeatInterval: task.repeatInterval ?? 1,
                        repeatEnd: task.repeatEnd ?? null,
                        repeatUntil: task.repeatUntil ? new Date(task.repeatUntil) : null,
                        repeatCount: task.repeatCount ?? null,
                      });
                    }}
                    onAddSubtask={(title) => createSubtask.mutate({ title, parentTaskId: task.id })}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog
        open={draft !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDraft(null);
            create.reset();
          }
        }}
      >
        <DialogContent title="New task" className="max-w-md">
          {draft && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="What's the plan?"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="text-center"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.title.trim()) submitDraft();
                }}
              />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px] text-center"
                placeholder="A little context, if you like"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <DateTimePicker
                value={draft.due}
                onChange={(due) =>
                  setDraft({
                    ...draft,
                    due,
                    ...(due
                      ? {}
                      : {
                          repeat: null,
                          repeatDays: null,
                          repeatInterval: 1,
                          repeatEnd: null,
                          repeatUntil: null,
                          repeatCount: null,
                        }),
                  })
                }
              />
              {draft.due ? (
                <RepeatField
                  due={draft.due}
                  value={draft}
                  onChange={(next) => setDraft({ ...draft, ...next })}
                />
              ) : (
                <RepeatField due={null} value={draft} onChange={() => {}} disabled />
              )}
              {createError && <p className="text-sm text-danger text-center">{createError}</p>}
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

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            saveEdit.reset();
          }
        }}
      >
        <DialogContent title="Edit task" className="max-w-md">
          {editing && (
            <div className="space-y-3">
              <Input
                placeholder="What's the plan?"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="text-center"
              />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px] text-center"
                placeholder="A little context, if you like"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <DateTimePicker
                value={editing.due}
                onChange={(due) =>
                  setEditing({
                    ...editing,
                    due,
                    ...(due
                      ? {}
                      : {
                          repeat: null,
                          repeatDays: null,
                          repeatInterval: 1,
                          repeatEnd: null,
                          repeatUntil: null,
                          repeatCount: null,
                        }),
                  })
                }
              />
              {editing.due ? (
                <RepeatField
                  due={editing.due}
                  value={editing}
                  onChange={(next) => setEditing({ ...editing, ...next })}
                />
              ) : (
                <RepeatField due={null} value={editing} onChange={() => {}} disabled />
              )}
              {editError && <p className="text-sm text-danger text-center">{editError}</p>}
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
          <span className={clsx(
            "block text-sm truncate transition-all duration-300",
            task.done && "line-through text-secondary opacity-70"
          )}>
            {task.title}
          </span>
          {task.description ? (
            <span className="block text-xs text-secondary truncate mt-0.5">{task.description}</span>
          ) : null}
          {task.dueAt ? (
            <span className="block text-xs text-secondary mt-0.5">
              {formatDueLabel(task.dueAt)}
              {task.repeatRule
                ? ` · ${formatRepeatLabel({
                    rule: task.repeatRule,
                    days: task.repeatDays,
                    interval: task.repeatInterval,
                    end: task.repeatEnd,
                    until: task.repeatUntil,
                    count: task.repeatCount,
                  })}`
                : ""}
            </span>
          ) : null}
        </button>
        {subtasks.length > 0 && (
          <span className="text-xs text-secondary shrink-0">
            {subtasks.filter((s) => s.done).length}/{subtasks.length}
          </span>
        )}
        <div className={clsx("row-actions flex items-center gap-1 shrink-0", task.starred && "!opacity-100")}>
          <button
            title={task.starred ? "Unstar" : "Star"}
            className={clsx("p-1 rounded-md", task.starred ? "text-accent" : "text-secondary hover:text-primary")}
            onClick={() => onPatch(task.id, { starred: !task.starred })}
          >
            <Star size={14} fill={task.starred ? "currentColor" : "none"} />
          </button>
          <button
            title="Edit"
            className="p-1 rounded-md text-secondary hover:text-primary"
            onClick={onEdit}
          >
            <Pencil size={14} />
          </button>
          <button
            title="Delete"
            className="p-1 rounded-md text-secondary hover:text-primary"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
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
                className="row-actions p-1 rounded-md text-secondary hover:text-primary"
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
