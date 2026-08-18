import { useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import type { Task } from "../lib/types";
import {
  FOCUS_DOT,
  FOCUS_MATRIX,
  FOCUS_META,
  FOCUS_PANE,
  FOCUS_SOFT_BG,
  FOCUS_TEXT,
  normalizeFocus,
  type TaskFocus,
} from "../lib/taskFocus";
import { formatDueLabel } from "./DateTimePicker";

function BoardCard({
  task,
  onToggle,
  onEdit,
  onDragStart,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
}) {
  const focus = normalizeFocus(task.focus);
  return (
    <div
      draggable={!task.done}
      onDragStart={(e) => onDragStart(e, task)}
      className={clsx(
        "focus-pill group/card px-2.5 py-2 cursor-grab active:cursor-grabbing",
        FOCUS_SOFT_BG[focus]
      )}
    >
      <div className="flex items-start gap-2 pl-0.5">
        <button
          type="button"
          onClick={onToggle}
          className={clsx(
            "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors",
            task.done
              ? "bg-accent border-accent text-surface-0"
              : "border-secondary/40 hover:border-accent bg-surface-1/40"
          )}
        >
          {task.done && <Check size={9} strokeWidth={3} />}
        </button>
        <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
          <span
            className={clsx(
              "block text-sm text-primary leading-snug font-medium",
              task.done && "line-through text-secondary opacity-70"
            )}
          >
            {task.title}
          </span>
          {task.dueAt && (
            <span className={clsx("block text-[10px] mt-0.5 tabular-nums", FOCUS_TEXT[focus] || "text-secondary")}>
              {formatDueLabel(task.dueAt)}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function Column({
  title,
  hint,
  focus,
  tasks,
  onToggle,
  onEdit,
  onDragStart,
  dropActive,
}: {
  title: string;
  hint: string;
  focus: TaskFocus;
  tasks: Task[];
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  dropActive?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col min-h-[240px] rounded-2xl overflow-hidden transition-[box-shadow,transform] duration-150",
        FOCUS_PANE[focus],
        dropActive && "ring-2 ring-[color:var(--pane-accent)]/40 scale-[1.01]"
      )}
    >
      <div className="px-3 py-2.5 border-b border-border/60 flex items-start gap-2">
        <span className={clsx("mt-1.5 h-2 w-2 rounded-full shrink-0", FOCUS_DOT[focus])} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={clsx("text-sm font-semibold tracking-tight", FOCUS_TEXT[focus])}>{title}</h3>
            <span className="focus-count text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md">
              {tasks.length}
            </span>
          </div>
          <p className="text-[10px] text-secondary mt-0.5 leading-snug">{hint}</p>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[min(60vh,520px)]">
        {tasks.length === 0 ? (
          <div className="py-8 px-2 text-center">
            <span className={clsx("inline-block h-1.5 w-8 rounded-full mb-2 opacity-50", FOCUS_DOT[focus])} />
            <p className="text-xs text-secondary">Drop a task here</p>
          </div>
        ) : (
          tasks.map((t) => (
            <BoardCard
              key={t.id}
              task={t}
              onToggle={() => onToggle(t)}
              onEdit={() => onEdit(t)}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DropZone({
  focus,
  children,
  onDropId,
}: {
  focus: TaskFocus;
  children: (active: boolean) => React.ReactNode;
  onDropId: (id: string) => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        const tid = e.dataTransfer.getData("text/task-id");
        if (tid) onDropId(tid);
      }}
      data-focus={focus}
    >
      {children(active)}
    </div>
  );
}

/** Eisenhower 2×2 — Hollow glass, drag between quadrants. */
export function EisenhowerBoard({
  tasks,
  onSetFocus,
  onToggle,
  onEdit,
}: {
  tasks: Task[];
  onSetFocus: (id: string, focus: TaskFocus) => void;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
}) {
  const open = tasks.filter((t) => !t.done);
  const byFocus = (f: TaskFocus) => open.filter((t) => normalizeFocus(t.focus) === f);

  function onDragStart(e: React.DragEvent, task: Task) {
    e.dataTransfer.setData("text/task-id", task.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3 text-[11px] text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--focus-critical)]" />
          Important ↑
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--focus-swift)]" />
          Urgent →
        </span>
        <span className="text-border">·</span>
        <span>Drag to reclassify</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FOCUS_MATRIX.map((id) => (
          <DropZone key={id} focus={id} onDropId={(tid) => onSetFocus(tid, id)}>
            {(active) => (
              <Column
                title={FOCUS_META[id].label}
                hint={FOCUS_META[id].hint}
                focus={id}
                tasks={byFocus(id)}
                onToggle={onToggle}
                onEdit={onEdit}
                onDragStart={onDragStart}
                dropActive={active}
              />
            )}
          </DropZone>
        ))}
      </div>
      <DropZone focus="none" onDropId={(tid) => onSetFocus(tid, "none")}>
        {(active) => (
          <div
            className={clsx(
              "rounded-2xl border border-dashed p-3 transition-colors",
              active ? "border-accent bg-accent-soft/40" : "border-border bg-surface-1/40"
            )}
          >
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-xs font-semibold text-secondary uppercase tracking-wide">Unsorted</span>
              <span className="text-[11px] text-secondary tabular-nums">{byFocus("none").length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {byFocus("none").length === 0 ? (
                <p className="text-xs text-secondary w-full text-center py-3">Clear focus · drop here</p>
              ) : (
                byFocus("none").map((t) => (
                  <div key={t.id} className="w-full sm:w-[calc(50%-0.25rem)]">
                    <BoardCard
                      task={t}
                      onToggle={() => onToggle(t)}
                      onEdit={() => onEdit(t)}
                      onDragStart={onDragStart}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DropZone>
    </div>
  );
}

/** Kanban columns by focus — horizontal board. */
export function KanbanBoard({
  tasks,
  onSetFocus,
  onToggle,
  onEdit,
}: {
  tasks: Task[];
  onSetFocus: (id: string, focus: TaskFocus) => void;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
}) {
  const open = tasks.filter((t) => !t.done);
  const columns: TaskFocus[] = ["critical", "steady", "swift", "quiet", "none"];

  function onDragStart(e: React.DragEvent, task: Task) {
    e.dataTransfer.setData("text/task-id", task.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3 min-w-max">
        {columns.map((id) => {
          const list = open.filter((t) => normalizeFocus(t.focus) === id);
          const meta = FOCUS_META[id];
          return (
            <DropZone key={id} focus={id} onDropId={(tid) => onSetFocus(tid, id)}>
              {(active) => (
                <div className="w-[252px] shrink-0">
                  <Column
                    title={meta.label}
                    hint={meta.hint}
                    focus={id}
                    tasks={list}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onDragStart={onDragStart}
                    dropActive={active}
                  />
                </div>
              )}
            </DropZone>
          );
        })}
      </div>
    </div>
  );
}
