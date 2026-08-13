import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Repeat } from "lucide-react";
import clsx from "clsx";
import { createTask, fetchTasks, updateTask } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { DateTimePicker } from "../components/DateTimePicker";
import { REPEAT_OPTIONS } from "../lib/taskRepeat";
import type { TaskRepeatRule } from "../lib/types";
import {
  addDays,
  addMonths,
  dateOnlyDue,
  dayKey,
  formatDayHeading,
  formatMonthTitle,
  monthGrid,
  moveDueToDate,
  parseDayKey,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  weekDays,
} from "./dateUtils";
import { datedTasks, groupByDay, tasksOnDay, type CalendarTask } from "./taskIndex";

type CalView = "schedule" | "week" | "day" | "agenda";
type Draft = {
  title: string;
  description: string;
  due: Date | null;
  repeat: TaskRepeatRule | null;
};
type EditDraft = Draft & { id: string };

const VIEWS: { id: CalView; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
  { id: "agenda", label: "Agenda" },
];

/** TickTick-style collapsible month + day list. */
export default function CalendarPage() {
  const queryClient = useQueryClient();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState<CalView>("schedule");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const dated = useMemo(() => datedTasks(tasks), [tasks]);
  const byDay = useMemo(() => groupByDay(dated), [dated]);
  const dayTasks = tasksOnDay(byDay, selected);
  const cells = useMemo(() => monthGrid(cursor), [cursor]);

  const selectedWeekIndex = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), 0);
    const diff = Math.round((startOfWeek(selected, 0).getTime() - gridStart.getTime()) / 86400000);
    return Math.max(0, Math.min(5, Math.floor(diff / 7)));
  }, [cursor, selected]);

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      invalidate();
      setDraft(null);
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
        dueAt?: string | null;
        repeatRule?: TaskRepeatRule | null;
      };
    }) => updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  function shiftMonth(dir: -1 | 1) {
    const next = addMonths(cursor, dir);
    setCursor(startOfMonth(next));
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const day = Math.min(selected.getDate(), last);
    setSelected(new Date(next.getFullYear(), next.getMonth(), day));
  }

  function jumpToday() {
    const t = startOfDay(new Date());
    setCursor(startOfMonth(t));
    setSelected(t);
    setExpanded(true);
  }

  function selectDay(d: Date) {
    setSelected(startOfDay(d));
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
      setCursor(startOfMonth(d));
    }
  }

  function openCreate(day: Date) {
    setDraft({ title: "", description: "", due: dateOnlyDue(day), repeat: null });
  }

  function onDragStart(e: React.DragEvent, task: CalendarTask) {
    e.dataTransfer.setData("text/task-id", task.id);
    e.dataTransfer.setData("text/due-at", task.dueAt ?? "");
    e.dataTransfer.effectAllowed = "move";
  }

  function onDropDay(e: React.DragEvent, day: Date) {
    e.preventDefault();
    setDropKey(null);
    const id = e.dataTransfer.getData("text/task-id");
    const dueAt = e.dataTransfer.getData("text/due-at");
    if (!id || !dueAt) return;
    const next = moveDueToDate(dueAt, day);
    if (next === dueAt) return;
    update.mutate({ id, patch: { dueAt: next } });
    selectDay(day);
  }

  const weekLabels = weekDays(today).map((d) => d.toLocaleDateString(undefined, { weekday: "narrow" }));
  const headerTitle =
    view === "agenda"
      ? "Agenda"
      : view === "day"
        ? selected.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : formatMonthTitle(cursor);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-1 mb-3">
        {view !== "agenda" && (
          <button type="button" onClick={() => (view === "day" ? selectDay(addDays(selected, -1)) : shiftMonth(-1))} className="p-1.5 rounded-lg hover:bg-surface-2 text-primary">
            <ChevronLeft size={20} />
          </button>
        )}
        <button type="button" onClick={jumpToday} className="flex-1 text-center text-lg font-medium text-primary truncate">
          {headerTitle}
        </button>
        {view !== "agenda" && (
          <button type="button" onClick={() => (view === "day" ? selectDay(addDays(selected, 1)) : shiftMonth(1))} className="p-1.5 rounded-lg hover:bg-surface-2 text-primary">
            <ChevronRight size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={jumpToday}
          className="ml-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-accent text-accent"
        >
          Today
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className="p-1.5 rounded-lg hover:bg-surface-2 text-secondary">
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-border glass-strong p-1.5 shadow-lg">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setView(v.id);
                    setMenuOpen(false);
                    if (v.id === "schedule") setExpanded(true);
                  }}
                  className={clsx(
                    "w-full text-left px-3 py-2 rounded-lg text-sm",
                    view === v.id ? "bg-accent-soft text-accent font-medium" : "text-primary hover:bg-surface-2"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading && !tasks ? (
        <p className="text-sm text-secondary text-center py-16">Loading…</p>
      ) : view === "schedule" ? (
        <>
          {/* Collapsible month — rolls between week and full month */}
          <div className="mb-1">
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-secondary mb-1">
              {weekLabels.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
            <div
              className="overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ maxHeight: expanded ? 320 : 56 }}
            >
              <div
                className="transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: expanded ? "translateY(0)" : `translateY(-${selectedWeekIndex * 52}px)` }}
              >
                {Array.from({ length: 6 }, (_, row) => (
                  <div key={row} className="grid grid-cols-7 h-[52px]">
                    {cells.slice(row * 7, row * 7 + 7).map((day) => {
                      const key = dayKey(day);
                      const inMonth = day.getMonth() === cursor.getMonth();
                      const isToday = sameDay(day, today);
                      const isSelected = sameDay(day, selected);
                      const open = tasksOnDay(byDay, day).filter((t) => !t.done);
                      const isDrop = dropKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => selectDay(day)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDropKey(key);
                          }}
                          onDragLeave={() => setDropKey((k) => (k === key ? null : k))}
                          onDrop={(e) => onDropDay(e, day)}
                          className={clsx(
                            "flex flex-col items-center pt-0.5 rounded-lg",
                            isDrop && "bg-accent-soft"
                          )}
                        >
                          <span
                            className={clsx(
                              "inline-flex h-[30px] w-[30px] items-center justify-center rounded-full text-sm",
                              isSelected && "bg-accent text-surface-0 font-semibold",
                              !isSelected && isToday && "border-[1.5px] border-accent font-semibold text-primary",
                              !isSelected && !isToday && inMonth && "text-primary",
                              !isSelected && !isToday && !inMonth && "text-secondary/40"
                            )}
                          >
                            {day.getDate()}
                          </span>
                          <div className="mt-1 w-[70%] space-y-0.5 min-h-[10px]">
                            {open.slice(0, 3).map((t) => (
                              <div
                                key={t.id}
                                className={clsx("h-[3px] rounded-full", t.starred ? "bg-accent" : "bg-secondary/50")}
                              />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex flex-col items-center gap-0.5 py-1 text-secondary hover:text-primary"
              aria-label={expanded ? "Collapse calendar" : "Expand calendar"}
            >
              <span className="block w-9 h-1 rounded-full bg-border" />
              <ChevronDown
                size={16}
                className={clsx("transition-transform duration-300", expanded && "rotate-180")}
              />
            </button>
          </div>

          <div className="flex items-center gap-2 border-y border-border py-2.5 mb-3">
            <h2 className="flex-1 text-sm font-semibold text-primary">
              {sameDay(selected, today) ? "Today" : formatDayHeading(selected)}
            </h2>
            <span className="text-xs text-secondary">{dayTasks.filter((t) => !t.done).length} open</span>
            <button type="button" onClick={() => openCreate(selected)} className="p-1 text-accent">
              <Plus size={18} />
            </button>
          </div>

          <div
            className="space-y-2 min-h-[180px]"
            onScroll={(e) => {
              const y = (e.target as HTMLDivElement).scrollTop;
              if (y > 24 && expanded) setExpanded(false);
              if (y < 8 && !expanded) setExpanded(true);
            }}
          >
            {dayTasks.length === 0 ? (
              <button
                type="button"
                onClick={() => openCreate(selected)}
                className="w-full py-12 text-sm text-secondary hover:text-accent"
              >
                No tasks · click to add
              </button>
            ) : (
              dayTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDragStart={onDragStart}
                  onToggle={() => update.mutate({ id: t.id, patch: { done: !t.done } })}
                  onEdit={() =>
                    setEditing({
                      id: t.id,
                      title: t.title,
                      description: t.description ?? "",
                      due: t.due,
                      repeat: t.repeatRule ?? null,
                    })
                  }
                />
              ))
            )}
          </div>
        </>
      ) : view === "week" ? (
        <div className="space-y-2">
          {weekDays(selected).map((day) => {
            const list = tasksOnDay(byDay, day);
            const isSel = sameDay(day, selected);
            const isToday = sameDay(day, today);
            return (
              <div
                key={dayKey(day)}
                onClick={() => selectDay(day)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropKey(dayKey(day));
                }}
                onDrop={(e) => onDropDay(e, day)}
                className={clsx(
                  "rounded-xl border p-3 cursor-pointer",
                  isSel || dropKey === dayKey(day) ? "border-accent bg-accent-soft/50" : "border-border glass"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-secondary w-8">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                      isToday && "bg-accent text-surface-0"
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreate(day);
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {list.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({
                        id: t.id,
                        title: t.title,
                        description: t.description ?? "",
                        due: t.due,
                        repeat: t.repeatRule ?? null,
                      });
                    }}
                    className={clsx("text-sm py-1 truncate cursor-grab", t.done && "line-through text-secondary")}
                  >
                    {t.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : view === "day" ? (
        <div className="space-y-2">
          <div className="flex items-center mb-2">
            <h2 className="flex-1 text-sm font-semibold">{formatDayHeading(selected)}</h2>
            <Button onClick={() => openCreate(selected)}>
              <Plus size={14} /> Add
            </Button>
          </div>
          {dayTasks.length === 0 ? (
            <p className="text-sm text-secondary py-8 text-center">Nothing scheduled.</p>
          ) : (
            dayTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onDragStart={onDragStart}
                onToggle={() => update.mutate({ id: t.id, patch: { done: !t.done } })}
                onEdit={() =>
                  setEditing({
                    id: t.id,
                    title: t.title,
                    description: t.description ?? "",
                    due: t.due,
                    repeat: t.repeatRule ?? null,
                  })
                }
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byDay.keys())
            .sort()
            .filter((k) => parseDayKey(k) >= addDays(today, -7))
            .map((key) => {
              const day = parseDayKey(key);
              const list = byDay.get(key) ?? [];
              return (
                <section key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      selectDay(day);
                      setView("schedule");
                      setExpanded(false);
                    }}
                    className="text-sm font-semibold text-primary mb-2"
                  >
                    {sameDay(day, today) ? "Today · " : ""}
                    {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </button>
                  <div className="space-y-2">
                    {list.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onDragStart={onDragStart}
                        onToggle={() => update.mutate({ id: t.id, patch: { done: !t.done } })}
                        onEdit={() =>
                          setEditing({
                            id: t.id,
                            title: t.title,
                            description: t.description ?? "",
                            due: t.due,
                            repeat: t.repeatRule ?? null,
                          })
                        }
                      />
                    ))}
                  </div>
                </section>
              );
            })}
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent title="New task" className="max-w-md">
          {draft && (
            <div className="space-y-3">
              <Input autoFocus placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px]"
                placeholder="Description (optional)"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <DateTimePicker value={draft.due} onChange={(due) => setDraft({ ...draft, due, repeat: due ? draft.repeat : null })} />
              {draft.due && (
                <select
                  className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm"
                  value={draft.repeat ?? ""}
                  onChange={(e) => setDraft({ ...draft, repeat: (e.target.value || null) as TaskRepeatRule | null })}
                >
                  {REPEAT_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value ?? ""}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={!draft.title.trim() || create.isPending}
                  onClick={() =>
                    create.mutate({
                      title: draft.title.trim(),
                      description: draft.description.trim() || undefined,
                      dueAt: draft.due ? draft.due.toISOString() : undefined,
                      repeatRule: draft.due ? draft.repeat : null,
                    })
                  }
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
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent resize-none min-h-[72px]"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <DateTimePicker
                value={editing.due}
                onChange={(due) => setEditing({ ...editing, due, repeat: due ? editing.repeat : null })}
              />
              {editing.due && (
                <select
                  className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm"
                  value={editing.repeat ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, repeat: (e.target.value || null) as TaskRepeatRule | null })
                  }
                >
                  {REPEAT_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value ?? ""}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={!editing.title.trim() || update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: editing.id,
                      patch: {
                        title: editing.title.trim(),
                        description: editing.description.trim(),
                        dueAt: editing.due ? editing.due.toISOString() : null,
                        repeatRule: editing.due ? editing.repeat : null,
                      },
                    })
                  }
                >
                  {update.isPending ? "Saving…" : "Save"}
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
  onDragStart,
  onToggle,
  onEdit,
}: {
  task: CalendarTask;
  onDragStart: (e: React.DragEvent, task: CalendarTask) => void;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      className="flex items-center gap-3 rounded-xl border border-border glass px-3 py-2.5 cursor-grab active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
          task.done ? "bg-accent border-accent text-surface-0" : "border-border"
        )}
      >
        {task.done && <Check size={11} strokeWidth={3} />}
      </button>
      <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
        <span className={clsx("text-sm text-primary", task.done && "line-through text-secondary")}>{task.title}</span>
      </button>
      {task.repeatRule && <Repeat size={12} className="text-secondary shrink-0" />}
    </div>
  );
}
