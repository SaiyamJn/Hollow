import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckSquare, ChevronDown, ChevronRight, Pencil, Plus, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { createTask, deleteTask, fetchTasks, updateTask } from "../lib/api";
import { dismissTaskNotification } from "../lib/notify";
import type { Task } from "../lib/types";
import { Input } from "../components/ui/input";
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

/* ── Circular checkbox (Microsoft To-Do style) ─────────────────────────── */
function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={clsx(
        "h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-300",
        checked
          ? "bg-accent border-accent text-surface-0 scale-95"
          : "border-secondary/40 hover:border-accent"
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
type EditDraft = Draft & { id: string };

/* ── Group icon for section headers ─────────────────────────────────────── */
function groupDotClass(name: GroupName) {
  if (name === "Overdue") return "bg-danger";
  if (name === "Today") return "bg-accent";
  if (name === "Starred") return "bg-accent";
  if (name === "Upcoming") return "bg-warn";
  return "bg-secondary/50";
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [layout, setLayout] = useState<TasksLayout>("list");
  const [hoverTaskId, setHoverTaskId] = useState<string | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupName>>(new Set());
  const quickAddRef = useRef<HTMLInputElement>(null);

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

  function onQuickAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && quickAdd.trim()) openCreate(quickAdd);
    if (e.key === "Escape") {
      setQuickAddOpen(false);
      setQuickAdd("");
    }
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

  function toggleGroup(name: GroupName) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
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

  const totalOpen = openGroups.reduce((sum, [, list]) => sum + list.length, 0);

  return (
    <div
      className={clsx(
        "mx-auto animate-rise-in",
        layout === "kanban" ? "px-5 py-5 max-w-[1280px]" : "px-7 py-10",
        layout === "list" && "max-w-2xl",
        layout === "matrix" && "max-w-5xl"
      )}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-medium">Tasks</h1>
        {tasks && tasks.length > 0 && (
          <p className="text-sm text-secondary mt-1">
            {totalOpen} open{completed.length > 0 ? ` · ${completed.length} completed` : ""}
          </p>
        )}
      </div>

      {/* ── Quick links ─────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 mb-5">
        <Link
          to="/recycle-bin?tab=tasks"
          className="inline-flex items-center gap-1.5 rounded-full chip-idle px-3 py-1.5 text-xs font-semibold hover:text-primary transition-colors"
        >
          <Trash2 size={13} />
          Recycle bin
        </Link>
      </div>

      {/* ── Layout switcher — pill toggle ───────────────────────── */}
      <div className="flex justify-center gap-1 mb-6 p-1 rounded-xl border border-border/60 glass w-fit mx-auto">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLayout(l.id)}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              layout === l.id
                ? "bg-accent text-surface-0 shadow-sm"
                : "text-secondary hover:text-primary hover:bg-surface-2/60"
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* ── "Add a task" bar — Google Tasks / Notes style ────────── */}
      <div className={clsx(
        "mb-8 mx-auto w-full",
        layout === "list" ? "max-w-2xl" : "max-w-xl"
      )}>
        {!quickAddOpen ? (
          <div
            onClick={() => {
              setQuickAddOpen(true);
              setTimeout(() => quickAddRef.current?.focus(), 0);
            }}
            className="flex items-center gap-3 rounded-xl border border-border/60 glass hover:border-border px-4 py-3 cursor-pointer transition-all group"
          >
            <Plus size={16} className="text-accent shrink-0" />
            <span className="text-sm text-secondary/70 font-normal flex-1">Add a task…</span>
          </div>
        ) : (
          <div className="rounded-xl border border-border/80 glass-strong px-4 py-3.5 shadow-md transition-all animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-secondary/30" />
              <input
                ref={quickAddRef}
                autoFocus
                className="flex-1 bg-transparent text-sm text-primary placeholder:text-secondary/60 focus:outline-none font-medium"
                placeholder="What needs to be done?"
                value={quickAdd}
                onChange={(e) => setQuickAdd(e.target.value)}
                onKeyDown={onQuickAdd}
                onBlur={() => {
                  if (!quickAdd.trim()) {
                    setQuickAddOpen(false);
                  }
                }}
              />
            </div>
            {quickAdd.trim() && (
              <p className="text-[11px] text-secondary/60 mt-2 ml-[30px]">
                Press Enter to add details · Escape to cancel
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────── */}
      {tasks && tasks.length === 0 && (
        <EmptyState
          icon={CheckSquare}
          title="Nothing on the list yet"
          subtitle="Add something whenever you're ready — List, Matrix, or Board."
          className="mb-6"
        />
      )}

      {/* ── Matrix layout ───────────────────────────────────────── */}
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

      {/* ── Kanban layout ───────────────────────────────────────── */}
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

      {/* ── List layout ─────────────────────────────────────────── */}
      {layout === "list" && (
      <div className="space-y-5">
        {openGroups.map(([name, list]) => {
          const collapsed = collapsedGroups.has(name);
          return (
            <section key={name}>
              {/* Group header — minimal, clickable to collapse */}
              <button
                type="button"
                onClick={() => toggleGroup(name)}
                className="flex items-center gap-2.5 mb-1.5 px-1 group/hdr w-full text-left"
              >
                <span className={clsx(
                  "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
                  groupDotClass(name)
                )} />
                <span className={clsx(
                  "text-xs font-semibold uppercase tracking-wider transition-colors",
                  name === "Overdue" ? "text-danger" : "text-secondary",
                )}>
                  {name}
                </span>
                <span className="text-[10px] text-secondary/60 font-medium tabular-nums">
                  {list.length}
                </span>
                <span className="flex-1" />
                <span className="text-secondary/40 group-hover/hdr:text-secondary transition-colors">
                  {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>

              {/* Task rows — clean, borderless, spacious */}
              {!collapsed && (
                <div className="rounded-2xl border border-border/50 glass overflow-hidden">
                  {list.map((task, i) => (
                    <div key={task.id}>
                      {i > 0 && <div className="mx-4 border-t border-border/30" />}
                      <TaskRow
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
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {/* ── Completed section ──────────────────────────────────── */}
        {completed.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-2.5 mb-1.5 px-1 w-full text-left group/hdr"
            >
              <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-accent/40" />
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Completed
              </span>
              <span className="text-[10px] text-secondary/60 font-medium tabular-nums">
                {completed.length}
              </span>
              <span className="flex-1" />
              <span className="text-secondary/40 group-hover/hdr:text-secondary transition-colors">
                {showCompleted ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            </button>
            {showCompleted && (
              <div className="rounded-2xl border border-border/40 glass overflow-hidden opacity-80">
                {completed.map((task, i) => (
                  <div key={task.id}>
                    {i > 0 && <div className="mx-4 border-t border-border/20" />}
                    <TaskRow
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
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      )}

      {/* ── New task dialog ──────────────────────────────────────── */}
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
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px] max-h-[40vh] overflow-y-auto text-center"
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
              <FocusField value={draft.focus} onChange={(focus) => setDraft({ ...draft, focus })} />
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

      {/* ── Edit task dialog ─────────────────────────────────────── */}
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
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px] max-h-[40vh] overflow-y-auto text-center"
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
              <FocusField
                value={editing.focus}
                onChange={(focus) => setEditing({ ...editing, focus })}
              />
              {editError && <p className="text-sm text-danger text-center">{editError}</p>}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  title="Delete task"
                  className="p-1.5 rounded-md text-secondary hover:text-danger transition-colors"
                  onClick={() => setConfirmDeleteTask(true)}
                >
                  <Trash2 size={14} />
                </button>
                <span className="flex-1" />
                <Button className="flex-1 max-w-[10rem]" variant="ghost" onClick={() => setEditing(null)}>
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

      {/* ── Confirm delete dialog ────────────────────────────────── */}
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

/* ── Task row — clean, spacious, Microsoft To-Do inspired ──────────────── */
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
  const completedSubtasks = subtasks.filter((s) => s.done).length;

  function onSubtaskKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && subtaskDraft.trim()) {
      onAddSubtask(subtaskDraft.trim());
      setSubtaskDraft("");
    }
  }

  return (
    <div
      className={clsx(
        "px-4 py-3 transition-all duration-200",
        task.starred && !task.done && "task-row-starred"
      )}
      onMouseEnter={() => onHover?.()}
    >
      {/* Main row */}
      <div className="group flex items-start gap-3">
        {/* Circular checkbox */}
        <div className="pt-0.5">
          <Checkbox checked={task.done} onToggle={() => onPatch(task.id, { done: !task.done })} />
        </div>

        {/* Content area — click to edit */}
        <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-1.5 min-w-0">
            <FocusDot focus={task.focus} />
            <span
              className={clsx(
                "text-sm leading-snug font-medium transition-all duration-300",
                task.done ? "line-through text-secondary/60" : "text-primary"
              )}
            >
              {task.title}
            </span>
          </span>

          {/* Meta line — description, chips */}
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 empty:hidden">
            {task.description && !task.done && (
              <span className="text-xs text-secondary/70 truncate max-w-[200px]">
                {task.description}
              </span>
            )}
            {task.dueAt && (
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
            )}
            <FocusChip focus={task.focus} className="shrink-0" />
            {subtasks.length > 0 && (
              <button
                type="button"
                title={expanded ? "Hide subtasks" : "View subtasks"}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-accent-soft/40 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent-soft transition-colors"
              >
                <CheckSquare size={9} />
                {completedSubtasks}/{subtasks.length}
              </button>
            )}
          </div>
        </button>

        {/* Right-side actions — hover reveal (Microsoft To-Do style) */}
        <div className={clsx("row-actions flex items-center gap-0.5 shrink-0 pt-0.5", task.starred && "!opacity-100")}>
          <button
            title={task.starred ? "Unstar" : "Star"}
            className={clsx(
              "p-1.5 rounded-lg transition-all",
              task.starred ? "text-accent" : "text-secondary/50 hover:text-accent"
            )}
            onClick={() => onPatch(task.id, { starred: !task.starred })}
          >
            <Star size={14} fill={task.starred ? "currentColor" : "none"} />
          </button>
          <button
            title="Edit"
            className="p-1.5 rounded-lg text-secondary/50 hover:text-primary transition-colors"
            onClick={onEdit}
          >
            <Pencil size={13} />
          </button>
          <button
            title="Delete"
            className="p-1.5 rounded-lg text-secondary/50 hover:text-danger transition-colors"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Expand toggle for subtasks */}
        {subtasks.length > 0 && (
          <button
            className="text-secondary/40 hover:text-secondary pt-1 shrink-0 transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {/* Subtasks — indented, minimal */}
      {expanded && (
        <div className="ml-[30px] mt-2.5 space-y-1 animate-fade-in">
          {subtasks.map((sub) => (
            <div key={sub.id} className="group flex items-center gap-2.5 py-1 px-1 rounded-lg hover:bg-surface-2/40 transition-colors">
              <Checkbox checked={sub.done} onToggle={() => onPatch(sub.id, { done: !sub.done })} />
              <span className={clsx(
                "flex-1 text-sm truncate transition-all duration-200",
                sub.done ? "line-through text-secondary/50" : "text-primary"
              )}>
                {sub.title}
              </span>
              <button
                title="Delete subtask"
                className="row-actions p-1 rounded-md text-secondary/40 hover:text-danger transition-colors"
                onClick={() => onDelete(sub.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2.5 py-1 px-1">
            <Plus size={12} className="text-secondary/40" />
            <input
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-secondary/40 text-primary"
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
