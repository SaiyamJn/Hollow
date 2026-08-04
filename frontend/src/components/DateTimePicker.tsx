import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import clsx from "clsx";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function formatDueLabel(iso: string | null | undefined) {
  if (!iso) return "No due date";
  const due = new Date(iso);
  const date = due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

interface DateTimePickerProps {
  value: Date | null;
  onChange: (next: Date | null) => void;
  className?: string;
  /** Start collapsed (default). Opens a compact popover when needed. */
  defaultOpen?: boolean;
}

/** Compact due-date control: one-line trigger, calendar + time only when expanded. */
export function DateTimePicker({ value, onChange, className, defaultOpen = false }: DateTimePickerProps) {
  const [open, setOpen] = useState(defaultOpen || value !== null);
  const initial = value ?? new Date();
  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));

  useEffect(() => {
    if (value) setCursor(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const count = daysInMonth(year, month);
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= count; d++) out.push(new Date(year, month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const today = startOfDay(new Date());
  const hour = value?.getHours() ?? 9;
  const minute = value?.getMinutes() ?? 0;
  const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function pickDay(day: Date) {
    const next = new Date(day);
    next.setHours(hour, minute, 0, 0);
    onChange(next);
  }

  function setTimeFromInput(raw: string) {
    const [hStr, mStr] = raw.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const base = value ? new Date(value) : new Date();
    if (!value) base.setHours(0, 0, 0, 0);
    base.setHours(h, m, 0, 0);
    onChange(base);
  }

  return (
    <div className={clsx("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={clsx(
            "flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
            value
              ? "border-border text-primary hover:border-accent"
              : "border-dashed border-border text-secondary hover:text-primary hover:border-secondary"
          )}
        >
          <Calendar size={14} className="shrink-0 opacity-70" />
          <span className="truncate">{value ? formatDueLabel(value.toISOString()) : "Add due date"}</span>
        </button>
        {value && (
          <button
            type="button"
            title="Clear due date"
            className="shrink-0 rounded-lg p-2 text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-lg border border-border bg-surface-1/80 p-2.5 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              className="rounded p-1 text-secondary hover:text-primary"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <p className="text-xs font-medium text-primary">{monthLabel}</p>
            <button
              type="button"
              className="rounded p-1 text-secondary hover:text-primary"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[9px] uppercase tracking-wide text-secondary py-0.5">
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const isSelected = value ? sameDay(day, value) : false;
              const isToday = sameDay(day, today);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={clsx(
                    "h-7 rounded-md text-[11px] transition-colors",
                    isSelected
                      ? "bg-accent text-surface-0 font-medium"
                      : isToday
                        ? "text-accent font-medium"
                        : "text-primary hover:bg-surface-2"
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 pt-1 border-t border-border">
            <Clock size={13} className="text-secondary shrink-0" />
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeFromInput(e.target.value)}
              className="bg-transparent text-sm text-primary tabular-nums focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
