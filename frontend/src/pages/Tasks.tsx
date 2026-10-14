import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckSquare, ChevronDown, ChevronRight, Pencil, Plus, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { createTask, deleteTask, fetchTasks, updateTask } from "../lib/api";
import { dismissTaskNotification } from "../lib/notify";
import type { Task } from "../lib/types";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { DateTimePicker } from "../components/DateTimePicker";
import { formatRepeatLabel, type RepeatEnd } from "../lib/taskRepeat";
import type { TaskRepeatRule } from "../lib/types";
import { RepeatField, repeatPayload } from "../components/RepeatPanel";
import { EisenhowerBoard, KanbanBoard } from "../components/TaskBoards";
import { FocusChip, FocusDot, FocusField } from "../components/FocusField";
import { DueChip } from "../components/StatusChip";
import { EmptyState } from "../components/EmptyState";
import { normalizeFocus, sortTasksByPriority, type TaskFocus } from "../lib/taskFocus";
import { shouldHandleItemDelete } from "../lib/keys";

type GroupName = "Starred" | "Overdue" | "Today" | "Upcoming" | "No date";
type TasksLayout = "list" | "matrix" | "kanban";

const LAYOUTS: { id: TasksLayout; label: string }[] = [
  { id: "list", label: "List" },
  { id: "matrix", label: "Matrix" },
  { id: "kanban", label: "Board" },
];

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
  const starred = sortTasksByPriority(open.filter((t) => t.starred));
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

  groups.Overdue = sortTasksByPriority(groups.Overdue);
  groups.Today = sortTasksByPriority(groups.Today);
  groups.Upcoming = sortTasksByPriority(groups.Upcoming);
  groups["No date"] = sortTasksByPriority(groups["No date"]);

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
      type="button"
      onClick={onToggle}
      className={clsx(
        "h-4 w-4 shrink-0 rounded-full border flex items-center justify-center transition-all duration-200",
        checked
          ? "bg-accent/80 border-accent/80 text-surface-0 scale-95"
          : "border-border/80 hover:border-accent/60"
      )}
    >
      {checked && <Check size={10} strokeWidth={3} className="animate-fade-in" />}
    </button>
  );
}

type Draft = {
  title: string;
  description: string;
  due: Date | null;
  focus: TaskFocus;
  repeat: TaskRepeatRule | null;
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: RepeatEnd | null;
  repeatUntil?: Date | null;
  repeatCount?: number | null;
};
type EditDraft = Draft & { id: string; starred?: boolean };

export default function Tasks() {
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickDesc, setQuickDesc] = useState("");
  const [quickDue, setQuickDue] = useState<Date | null>(null);
  const [quickFocus, setQuickFocus] = useState<TaskFocus>("none");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [layout, setLayout] = useState<TasksLayout>("list");
  const [hoverTaskId, setHoverTaskId] = useState<string | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);

  /** Board fills the viewport — lock shell scroll so only columns scroll. */
  useEffect(() => {
    if (layout !== "kanban") return;
    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) return;
    const prev = main.style.overflowY;
    main.style.overflowY = "hidden";
    return () => {
      main.style.overflowY = prev;
    };
  }, [layout]);

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
        focus?: TaskFocus;
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
        focus?: TaskFocus;
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
  const remove = useMutation({
    mutationFn: (id: string) => {
      dismissTaskNotification(id);
      return deleteTask(id);
    },
    onSuccess: invalidate,
  });

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!shouldHandleItemDelete(e) || !hoverTaskId) return;
      e.preventDefault();
      remove.mutate(hoverTaskId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hoverTaskId, remove]);

  function openCreate(title: string) {
    setDraft({
      title: title.trim(),
      description: "",
      due: null,
      focus: "none",
      repeat: null,
      repeatDays: null,
      repeatInterval: 1,
      repeatEnd: null,
      repeatUntil: null,
      repeatCount: null,
    });
    create.reset();
  }

  function handleQuickSubmit() {
    if (!quickAdd.trim() || create.isPending) return;
    create.mutate({
      title: quickAdd.trim(),
      description: quickDesc.trim() || undefined,
      dueAt: quickDue ? quickDue.toISOString() : undefined,
      focus: quickFocus,
    });
    setQuickAdd("");
    setQuickDesc("");
    setQuickDue(null);
    setQuickFocus("none");
    setQuickAddOpen(false);
  }


  function submitDraft() {
    if (!draft?.title.trim() || create.isPending) return;
    create.mutate({
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      dueAt: draft.due ? draft.due.toISOString() : undefined,
      focus: draft.focus,
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
        focus: editing.focus,
        ...repeatPayload(editing),
      },
    });
  }

  const createError =
    (create.error as any)?.response?.data?.error ?? (create.error ? "Couldn't add task." : null);
  const editError =
    (saveEdit.error as any)?.response?.data?.error ?? (saveEdit.error ? "Couldn't save." : null);

  const openGroups = groupOpenTasks(tasks ?? []);
  const completed = [...(tasks ?? []).filter((t) => t.done)].sort((a, b) => {
    const timeA = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.createdAt).getTime();
    const timeB = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
  const boardTasks = useMemo(() => {
    const endOfToday = new Date();
    endOfToday.setHours(0, 0, 0, 0);
    endOfToday.setDate(endOfToday.getDate() + 1);
    return (tasks ?? []).filter((t) => !isDeferredRepeat(t, endOfToday));
  }, [tasks]);

  return (
    <div
      className={clsx(
        "mx-auto",
        layout === "kanban" ? "px-5 py-5 max-w-[1280px]" : "px-7 py-10",
        layout === "list" && "max-w-2xl",
        layout === "matrix" && "max-w-5xl"
      )}
    >
      {/* Sleek Minimal Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Tasks</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Subtle minimal layout switcher */}
          <div className="flex items-center p-0.5 rounded-xl border border-border/60 glass-strong shadow-xs">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayout(l.id)}
                className={clsx(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                  layout === l.id
                    ? "bg-surface-2 text-primary shadow-xs"
                    : "text-secondary hover:text-primary"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>

          <Link
            to="/recycle-bin?tab=tasks"
            title="Recycle bin"
            className="p-1.5 rounded-xl border border-border/50 glass text-secondary hover:text-primary hover:border-border transition-colors"
          >
            <Trash2 size={15} />
          </Link>
        </div>
      </div>

      {/* Google Keep / Tasks Minimal Quick Creator */}
      <div
        className={clsx(
          "mb-6 mx-auto w-full",
          layout === "list" ? "max-w-2xl" : "max-w-xl"
        )}
      >
        {!quickAddOpen ? (
          <div
            onClick={() => setQuickAddOpen(true)}
            className="flex items-center justify-between rounded-xl border border-border/70 glass hover:border-border/90 px-4 py-2.5 shadow-xs cursor-pointer transition-all"
          >
            <div className="flex items-center gap-2.5 text-secondary/70">
              <Plus size={16} className="text-secondary/60" />
              <span className="text-sm font-normal">Add a task…</span>
            </div>
            <span className="text-xs text-secondary/40 font-mono hidden sm:inline">↵</span>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/80 glass-strong p-3.5 shadow-sm transition-all space-y-2.5">
            <input
              autoFocus
              placeholder="Task title…"
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickAdd.trim()) {
                  e.preventDefault();
                  handleQuickSubmit();
                } else if (e.key === "Escape") {
                  setQuickAddOpen(false);
                  setQuickAdd("");
                  setQuickDesc("");
                  setQuickDue(null);
                  setQuickFocus("none");
                }
              }}
              className="w-full bg-transparent text-sm font-medium text-primary placeholder:text-secondary/60 focus:outline-none border-0 p-0"
            />
            <textarea
              rows={2}
              placeholder="Details (optional)"
              value={quickDesc}
              onChange={(e) => setQuickDesc(e.target.value)}
              className="w-full bg-transparent text-xs text-primary placeholder:text-secondary/50 focus:outline-none border-0 p-0 resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <div className="flex items-center gap-2">
                <DateTimePicker
                  value={quickDue}
                  onChange={setQuickDue}
                />
                <button
                  type="button"
                  title="More options (repeat, priority)"
                  onClick={() => {
                    const currentTitle = quickAdd;
                    setQuickAddOpen(false);
                    openCreate(currentTitle);
                  }}
                  className="text-xs text-secondary/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-surface-2 transition-colors"
                >
                  More options
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  className="text-xs px-2.5 py-1 h-7"
                  onClick={() => {
                    setQuickAddOpen(false);
                    setQuickAdd("");
                    setQuickDesc("");
                    setQuickDue(null);
                    setQuickFocus("none");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  className="text-xs px-3 py-1 h-7 font-medium"
                  disabled={!quickAdd.trim() || create.isPending}
                  onClick={handleQuickSubmit}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {tasks && tasks.length === 0 && (
        <EmptyState
          icon={CheckSquare}
          title="Nothing on the list yet"
          subtitle="Add something whenever you're ready — List, Matrix, or Board."
          className="mb-6"
        />
      )}

      {layout === "matrix" && tasks && (
        <EisenhowerBoard
          tasks={boardTasks}
          onSetFocus={(id, focus) => update.mutate({ id, patch: { focus } })}
          onToggle={(t) => update.mutate({ id: t.id, patch: { done: !t.done } })}
          onHover={(t) => setHoverTaskId(t.id)}
          onEdit={(task) => {
            saveEdit.reset();
            setEditing({
              id: task.id,
              title: task.title,
              description: task.description ?? "",
              due: task.dueAt ? new Date(task.dueAt) : null,
              focus: normalizeFocus(task.focus),
              repeat: task.repeatRule ?? null,
              repeatDays: task.repeatDays ?? null,
              repeatInterval: task.repeatInterval ?? 1,
              repeatEnd: task.repeatEnd ?? null,
              repeatUntil: task.repeatUntil ? new Date(task.repeatUntil) : null,
              repeatCount: task.repeatCount ?? null,
            });
          }}
        />
      )}

      {layout === "kanban" && tasks && (
        <KanbanBoard
          tasks={boardTasks}
          onSetFocus={(id, focus) => update.mutate({ id, patch: { focus } })}
          onToggle={(t) => update.mutate({ id: t.id, patch: { done: !t.done } })}
          onHover={(t) => setHoverTaskId(t.id)}
          onEdit={(task) => {
            saveEdit.reset();
            setEditing({
              id: task.id,
              title: task.title,
              description: task.description ?? "",
              due: task.dueAt ? new Date(task.dueAt) : null,
              focus: normalizeFocus(task.focus),
              repeat: task.repeatRule ?? null,
              repeatDays: task.repeatDays ?? null,
              repeatInterval: task.repeatInterval ?? 1,
              repeatEnd: task.repeatEnd ?? null,
              repeatUntil: task.repeatUntil ? new Date(task.repeatUntil) : null,
              repeatCount: task.repeatCount ?? null,
            });
          }}
        />
      )}

      {layout === "list" && (
      <div className="space-y-6">
        {openGroups.map(([name, list]) => (
          <section key={name}>
            <h2
              className={clsx("section-label mb-2", {
                "section-label-danger": name === "Overdue",
                "section-label-warn": name === "Upcoming",
                "section-label-muted": name === "No date",
              })}
            >
              {name}
            </h2>
            <div className="rounded-2xl border border-border/60 glass-strong shadow-xs divide-y divide-border/30 overflow-hidden">
              {list.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onPatch={(id, patch) => update.mutate({ id, patch })}
                  onDelete={(id) => remove.mutate(id)}
                  onHover={() => setHoverTaskId(task.id)}
                  onEdit={() => {
                    saveEdit.reset();
                    setEditing({
                      id: task.id,
                      title: task.title,
                      description: task.description ?? "",
                      due: task.dueAt ? new Date(task.dueAt) : null,
                      focus: normalizeFocus(task.focus),
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
                         text-secondary/70 hover:text-primary mb-2 py-1"
            >
              {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="rounded-2xl border border-border/50 glass shadow-xs divide-y divide-border/30 overflow-hidden">
                {completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onPatch={(id, patch) => update.mutate({ id, patch })}
                    onDelete={(id) => remove.mutate(id)}
                    onHover={() => setHoverTaskId(task.id)}
                    onEdit={() => {
                      saveEdit.reset();
                      setEditing({
                        id: task.id,
                        title: task.title,
                        description: task.description ?? "",
                        due: task.dueAt ? new Date(task.dueAt) : null,
                        focus: normalizeFocus(task.focus),
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
      )}

      <Dialog
        open={draft !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDraft(null);
            create.reset();
          }
        }}
      >
        <DialogContent
          hideHeader
          title="New task"
          className="w-[min(94vw,34rem)] max-w-lg p-5 sm:p-6 rounded-3xl border border-border/80 shadow-2xl glass-strong flex flex-col"
        >
          {draft && (
            <div className="space-y-3.5">
              <input
                autoFocus
                placeholder="What's the plan?"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full bg-transparent text-lg font-medium text-primary placeholder:text-secondary/60 focus:outline-none border-0 p-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.title.trim()) submitDraft();
                }}
              />
              <textarea
                className="w-full bg-transparent text-sm text-primary placeholder:text-secondary/60 focus:outline-none border-0 p-0 resize-none min-h-[60px] max-h-[30vh] leading-relaxed"
                placeholder="A little context, if you like"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <div className="pt-2 border-t border-border/30 space-y-3">
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
                <FocusField value={draft.focus} onChange={(focus) => setDraft({ ...draft, focus })} />
              </div>
              {createError && <p className="text-xs text-danger text-center">{createError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                <Button variant="ghost" className="text-xs font-semibold px-3 py-1.5" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  className="text-xs font-semibold px-4 py-1.5"
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
        <DialogContent
          hideHeader
          title="Edit task"
          className="w-[min(94vw,34rem)] max-w-lg p-5 sm:p-6 rounded-3xl border border-border/80 shadow-2xl glass-strong flex flex-col"
        >
          {editing && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <input
                  autoFocus
                  placeholder="Task title"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full bg-transparent text-lg font-medium text-primary placeholder:text-secondary/60 focus:outline-none border-0 p-0"
                />
                <button
                  type="button"
                  title={editing.starred ? "Unstar task" : "Star task"}
                  onClick={() => {
                    const nextStarred = !editing.starred;
                    setEditing({ ...editing, starred: nextStarred });
                    update.mutate({ id: editing.id, patch: { starred: nextStarred } });
                  }}
                  className="p-1.5 rounded-full text-secondary hover:text-primary hover:bg-surface-2 transition-colors shrink-0"
                >
                  <Star
                    size={18}
                    className={clsx(
                      editing.starred ? "text-accent fill-accent" : "text-secondary hover:text-primary"
                    )}
                  />
                </button>
              </div>

              <textarea
                className="w-full bg-transparent text-sm text-primary placeholder:text-secondary/60 focus:outline-none border-0 p-0 resize-none min-h-[60px] max-h-[30vh] leading-relaxed"
                placeholder="A little context, if you like"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />

              <div className="pt-2 border-t border-border/30 space-y-3">
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
                <FocusField
                  value={editing.focus}
                  onChange={(focus) => setEditing({ ...editing, focus })}
                />
              </div>

              {editError && <p className="text-xs text-danger text-center">{editError}</p>}

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/30">
                <button
                  type="button"
                  title="Delete task"
                  className="p-2 rounded-lg text-secondary hover:text-danger hover:bg-surface-2 transition-colors"
                  onClick={() => setConfirmDeleteTask(true)}
                >
                  <Trash2 size={16} />
                </button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    className="text-xs font-semibold px-3 py-1.5"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="accent"
                    className="text-xs font-semibold px-4 py-1.5"
                    disabled={!editing.title.trim() || saveEdit.isPending}
                    onClick={submitEdit}
                  >
                    {saveEdit.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteTask} onOpenChange={setConfirmDeleteTask}>
        <DialogContent title="Move to recycle bin?">
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              Move "{editing?.title}" to the recycle bin? You can restore it within 7 days.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setConfirmDeleteTask(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!editing) return;
                  remove.mutate(editing.id);
                  setConfirmDeleteTask(false);
                  setEditing(null);
                }}
              >
                <span className="text-danger">Move</span>
              </Button>
            </div>
          </div>
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
  onHover,
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
  onHover?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const subtasks = sortTasksByPriority(task.subtasks ?? []);

  function onSubtaskKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && subtaskDraft.trim()) {
      onAddSubtask(subtaskDraft.trim());
      setSubtaskDraft("");
    }
  }

  return (
    <div
      className={clsx("px-3.5 py-2.5 transition-colors group", task.starred && !task.done && "row-starred")}
      onMouseEnter={() => onHover?.()}
    >
      <div className="flex items-center gap-2.5">
        {subtasks.length > 0 ? (
          <button
            type="button"
            className="text-secondary/60 hover:text-primary transition-colors shrink-0"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Checkbox checked={task.done} onToggle={() => onPatch(task.id, { done: !task.done })} />
        <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-1.5 min-w-0">
            <FocusDot focus={task.focus} />
            <span
              className={clsx(
                "block text-sm truncate transition-all duration-200 font-medium pr-1",
                task.done ? "line-through text-secondary/60 opacity-70" : "text-primary"
              )}
            >
              {task.title}
            </span>
            <FocusChip focus={task.focus} className="shrink-0" />
            {subtasks.length > 0 && (
              <button
                type="button"
                title={expanded ? "Hide subtasks" : "View subtasks"}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border/60 bg-accent-soft/40 px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent-soft/70 transition-colors"
              >
                <CheckSquare size={10} />
                {subtasks.filter((s) => s.done).length}/{subtasks.length}
              </button>
            )}
          </span>
          {task.description ? (
            <span className="block text-xs text-secondary/70 truncate mt-0.5">{task.description}</span>
          ) : null}
          {task.dueAt ? (
            <span className="mt-1 inline-flex">
              <DueChip
                dueAt={task.dueAt}
                prefix={
                  task.repeatRule
                    ? formatRepeatLabel({
                        rule: task.repeatRule,
                        days: task.repeatDays,
                        interval: task.repeatInterval,
                        end: task.repeatEnd,
                        until: task.repeatUntil,
                        count: task.repeatCount,
                      })
                    : undefined
                }
              />
            </span>
          ) : null}
        </button>
        <div className={clsx("row-actions flex items-center gap-0.5 shrink-0", task.starred && "!opacity-100")}>
          <button
            type="button"
            title={task.starred ? "Unstar" : "Star"}
            className={clsx(
              "p-1.5 rounded-lg transition-colors",
              task.starred ? "text-accent" : "text-secondary/60 hover:text-primary hover:bg-surface-2"
            )}
            onClick={() => onPatch(task.id, { starred: !task.starred })}
          >
            <Star size={13} fill={task.starred ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            title="Edit"
            className="p-1.5 rounded-lg text-secondary/60 hover:text-primary hover:bg-surface-2 transition-colors"
            onClick={onEdit}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            title="Delete"
            className="p-1.5 rounded-lg text-secondary/60 hover:text-danger hover:bg-surface-2 transition-colors"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 size={13} />
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
