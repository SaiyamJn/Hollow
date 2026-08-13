import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import clsx from "clsx";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);

const ITEM_H = 28;
const VISIBLE = 3;
const PAD = Math.floor(VISIBLE / 2);

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
  const isDateOnly =
    due.getHours() === 0 && due.getMinutes() === 0 && due.getSeconds() === 0;
  if (isDateOnly) return date;
  const hh = String(due.getHours()).padStart(2, "0");
  const mm = String(due.getMinutes()).padStart(2, "0");
  return `${date} · ${hh}:${mm}`;
}

interface DateTimePickerProps {
  value: Date | null;
  onChange: (next: Date | null) => void;
  className?: string;
  defaultOpen?: boolean;
}

/** Compact snap wheel for hour / minute. */
function RollingColumn({
  items,
  value,
  onChange,
  format = (n) => String(n).padStart(2, "0"),
  ariaLabel,
}: {
  items: number[];
  value: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
  ariaLabel: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);
  const endTimer = useRef<number | null>(null);
  const index = Math.max(0, items.indexOf(value));

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || lockRef.current) return;
    const top = index * ITEM_H;
    if (Math.abs(el.scrollTop - top) > 1) {
      el.scrollTo({ top, behavior: "smooth" });
    }
  }, [index]);

  function commitFromScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
    const snapped = i * ITEM_H;
    if (Math.abs(el.scrollTop - snapped) > 0.5) {
      el.scrollTo({ top: snapped, behavior: "smooth" });
    }
    const next = items[i];
    if (next !== value) onChange(next);
    lockRef.current = false;
  }

  function onScroll() {
    lockRef.current = true;
    if (endTimer.current) window.clearTimeout(endTimer.current);
    endTimer.current = window.setTimeout(commitFromScroll, 80);
  }

  return (
    <div className="relative w-11 select-none" style={{ height: ITEM_H * VISIBLE }} aria-label={ariaLabel}>
      <div
        className="pointer-events-none absolute inset-x-0 z-10 rounded-md bg-accent-soft border border-accent/20"
        style={{ top: ITEM_H * PAD, height: ITEM_H }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-5 bg-gradient-to-b from-[var(--surface-1)] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-5 bg-gradient-to-t from-[var(--surface-1)] to-transparent" />

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain snap-y snap-mandatory scrollbar-none"
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div style={{ height: ITEM_H * PAD }} />
        {items.map((n) => {
          const active = n === value;
          return (
            <button
              key={n}
              type="button"
              tabIndex={-1}
              onClick={() => {
                onChange(n);
                scrollerRef.current?.scrollTo({ top: items.indexOf(n) * ITEM_H, behavior: "smooth" });
              }}
              className={clsx(
                "w-full snap-center flex items-center justify-center text-xs tabular-nums transition-colors",
                active ? "text-primary font-medium" : "text-secondary"
              )}
              style={{ height: ITEM_H }}
            >
              {format(n)}
            </button>
          );
        })}
        <div style={{ height: ITEM_H * PAD }} />
      </div>
    </div>
  );
}

/** Collapsed due-date control; expands to a compact calendar + custom time wheels. */
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
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function pickDay(day: Date) {
    const next = new Date(day);
    next.setHours(hour, minute, 0, 0);
    onChange(next);
  }

  function setTime(h: number, m: number) {
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

          <div className="flex items-center justify-center gap-1 pt-1.5 border-t border-border">
            <RollingColumn items={HOURS} value={hour} onChange={(h) => setTime(h, minute)} ariaLabel="Hour" />
            <span className="text-secondary text-sm font-medium pb-0.5">:</span>
            <RollingColumn items={MINUTES} value={minute} onChange={(m) => setTime(hour, m)} ariaLabel="Minute" />
          </div>
        </div>
      )}
    </div>
  );
}
