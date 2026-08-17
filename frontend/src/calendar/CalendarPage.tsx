import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Repeat } from "lucide-react";
import clsx from "clsx";
import { createTask, fetchTasks, updateTask } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { DateTimePicker } from "../components/DateTimePicker";
import type { TaskRepeatRule } from "../lib/types";
import { RepeatField, repeatPayload } from "../components/RepeatPanel";
import type { RepeatEnd } from "../lib/taskRepeat";
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
  weekDays,
} from "./dateUtils";
import { datedTasks, expandForRange, groupByDay, tasksOnDay, type CalendarTask } from "./taskIndex";

type CalView = "schedule" | "week" | "day" | "agenda";
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

const VIEWS: { id: CalView; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
  { id: "agenda", label: "Agenda" },
];

/** TickTick-style collapsible month + day list. */
export default function CalendarPage() {
  const queryClient = useQueryClient();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = useMemo(() => startOfDay(new Date(nowMs)), [nowMs]);
  const [view, setView] = useState<CalView>("schedule");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const pullStartY = useRef<number | null>(null);

  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const dated = useMemo(() => datedTasks(tasks), [tasks]);
  // Wide window so schedule indicators + agenda cover far-out repeats.
  const rangeStart = useMemo(() => addDays(startOfMonth(cursor), -40), [cursor]);
  const rangeEnd = useMemo(() => addDays(startOfMonth(addMonths(cursor, 12)), -1), [cursor]);
  const expandedTasks = useMemo(
    () => expandForRange(dated, rangeStart, rangeEnd),
    [dated, rangeStart, rangeEnd]
  );
  const byDay = useMemo(() => groupByDay(expandedTasks), [expandedTasks]);
  const dayTasks = tasksOnDay(byDay, selected);
  const cells = useMemo(() => monthGrid(cursor), [cursor]);

  const weekStrip = useMemo(() => weekDays(selected), [selected]);

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
    setExpanded(false);
  }

  function selectDay(d: Date) {
    setSelected(startOfDay(d));
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
      setCursor(startOfMonth(d));
    }
  }

  function openCreate(day: Date) {
    setDraft({
      title: "",
      description: "",
      due: dateOnlyDue(day),
      repeat: null,
      repeatDays: null,
      repeatInterval: 1,
      repeatEnd: null,
      repeatUntil: null,
      repeatCount: null,
    });
  }

  function onDragStart(e: React.DragEvent, task: CalendarTask) {
    if (task.virtual) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/task-id", task.id);
    e.dataTransfer.setData("text/due-at", task.dueAt ?? "");
    e.dataTransfer.effectAllowed = "move";
  }

  function onDropDay(e: React.DragEvent, day: Date) {
    e.preventDefault();
    setDropKey(null);
    const id = e.dataTransfer.getData("text/task-id");
    const dueAt = e.dataTransfer.getData("text/due-at");
    if (!id || !dueAt || id.includes("__")) return;
    const next = moveDueToDate(dueAt, day);
    if (next === dueAt) return;
    update.mutate({ id, patch: { dueAt: next } });
    selectDay(day);
  }

  function beginEdit(t: CalendarTask) {
    // Always edit the series anchor (dueAt), not a virtual occurrence day —
    // otherwise saving from a future occurrence rewrites the whole schedule.
    const seriesDue = t.dueAt ? new Date(t.dueAt) : t.due;
    setEditing({
      id: t.sourceId ?? t.id,
      title: t.title,
      description: t.description ?? "",
      due: seriesDue,
      repeat: t.repeatRule ?? null,
      repeatDays: t.repeatDays ?? null,
      repeatInterval: t.repeatInterval ?? 1,
      repeatEnd: t.repeatEnd ?? null,
      repeatUntil: t.repeatUntil ? new Date(t.repeatUntil) : null,
      repeatCount: t.repeatCount ?? null,
    });
  }

  function toggleTask(t: CalendarTask) {
    if (t.virtual) return;
    update.mutate({ id: t.id, patch: { done: !t.done } });
  }

  const weekLabels = weekDays(today).map((d) => d.toLocaleDateString(undefined, { weekday: "narrow" }));
  const headerTitle =
    view === "agenda"
      ? "Agenda"
      : view === "day"
        ? selected.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : formatMonthTitle(cursor);

  function renderDayCell(day: Date) {
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
        className={clsx("flex flex-col items-center pt-0.5", isDrop && "bg-accent-soft/60 rounded-xl")}
      >
        <span
          className={clsx(
            "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
            isSelected && "bg-accent text-surface-0 font-semibold shadow-sm",
            !isSelected && isToday && "border-[1.5px] border-accent font-semibold text-primary",
            !isSelected && !isToday && inMonth && "text-primary",
            !isSelected && !isToday && !inMonth && "text-secondary/40"
          )}
        >
          {day.getDate()}
        </span>
        <div className="mt-1 w-[70%] min-h-[10px] max-h-[12px] space-y-0.5 overflow-hidden flex flex-col items-stretch">
          {open.slice(0, 3).map((t) => (
            <div
              key={t.id}
              className={clsx(
                "h-[3px] w-full rounded-full",
                t.starred ? "bg-accent" : "bg-secondary/70",
                t.virtual && "opacity-40"
              )}
            />
          ))}
        </div>
      </button>
    );
  }

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
                    if (v.id === "schedule") setExpanded(false);
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
              className="overflow-hidden transition-[max-height] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ maxHeight: expanded ? 360 : 64 }}
            >
              {expanded ? (
                Array.from({ length: 6 }, (_, row) => (
                  <div key={row} className="grid grid-cols-7 h-[56px]">
                    {cells.slice(row * 7, row * 7 + 7).map((day) => renderDayCell(day))}
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-7 h-[56px]">
                  {weekStrip.map((day) => renderDayCell(day))}
                </div>
              )}
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
                className={clsx("transition-transform duration-350", expanded ? "rotate-180" : "rotate-0")}
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
            className="space-y-2 min-h-[220px]"
            onPointerDown={(e) => {
              const el = e.target as HTMLElement;
              if (el.closest("button") && !el.closest("[data-day-empty]")) {
                pullStartY.current = null;
                return;
              }
              pullStartY.current = e.clientY;
            }}
            onPointerMove={(e) => {
              if (pullStartY.current == null) return;
              const dy = e.clientY - pullStartY.current;
              if (!expanded && dy > 48) {
                pullStartY.current = null;
                setExpanded(true);
              } else if (expanded && dy < -48) {
                pullStartY.current = null;
                setExpanded(false);
              }
            }}
            onPointerUp={() => {
              pullStartY.current = null;
            }}
            onPointerCancel={() => {
              pullStartY.current = null;
            }}
          >
            {dayTasks.length === 0 ? (
              <div
                data-day-empty
                className="w-full py-10 flex flex-col items-center gap-3 text-secondary select-none"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent text-xl">
                  ✦
                </span>
                <span className="text-sm font-semibold text-primary">Nothing planned</span>
                <span className="text-xs text-center px-4">
                  {expanded
                    ? "Swipe up for the week view · click to add something."
                    : "Swipe down for the full month · click to add something."}
                </span>
                <button
                  type="button"
                  onClick={() => openCreate(selected)}
                  className="text-sm text-accent font-medium hover:underline"
                >
                  Add something
                </button>
              </div>
            ) : (
              dayTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDragStart={onDragStart}
                  onToggle={() => toggleTask(t)}
                  onEdit={() => beginEdit(t)}
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
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={clsx(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                        isToday && "bg-accent text-surface-0"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {list.filter((t) => !t.done).length > 0 && (
                      <div className="flex gap-0.5">
                        {list
                          .filter((t) => !t.done)
                          .slice(0, 3)
                          .map((t) => (
                            <span
                              key={t.id}
                              className={clsx(
                                "h-1 w-2.5 rounded-full",
                                t.starred ? "bg-accent" : "bg-secondary/70",
                                t.virtual && "opacity-40"
                              )}
                            />
                          ))}
                      </div>
                    )}
                  </div>
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
                      beginEdit(t);
                    }}
                    className={clsx(
                      "text-sm py-1 truncate cursor-grab",
                      t.done && "line-through text-secondary"
                    )}
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
                onToggle={() => toggleTask(t)}
                onEdit={() => beginEdit(t)}
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
                        onToggle={() => toggleTask(t)}
                        onEdit={() => beginEdit(t)}
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
              <Input
                autoFocus
                placeholder="What's the plan?"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <textarea
                className="w-full rounded-lg border border-border glass-input px-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[72px]"
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
                      ...repeatPayload(draft),
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
                        ...repeatPayload(editing),
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
      draggable={!task.virtual}
      onDragStart={(e) => onDragStart(e, task)}
      className={clsx(
        "flex items-center gap-3 rounded-xl border border-border glass px-3 py-2.5 transition-colors duration-200",
        task.virtual ? "cursor-pointer opacity-90" : "cursor-grab active:cursor-grabbing"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!!task.virtual}
        className={clsx(
          "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
          task.done ? "bg-accent border-accent text-surface-0" : "border-border",
          task.virtual && "opacity-40"
        )}
      >
        {task.done && <Check size={11} strokeWidth={3} />}
      </button>
      <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
        <span className={clsx("text-sm text-primary", task.done && "line-through text-secondary")}>
          {task.title}
        </span>
      </button>
      {task.repeatRule && <Repeat size={12} className="text-secondary shrink-0" />}
    </div>
  );
}
