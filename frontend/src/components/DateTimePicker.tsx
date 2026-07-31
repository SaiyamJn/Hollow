import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);

const ITEM_H = 36;
const VISIBLE = 5;
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
  const time = due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

interface DateTimePickerProps {
  value: Date | null;
  onChange: (next: Date | null) => void;
  className?: string;
}

/** Apple-style snap wheel for a finite list of numbers. */
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
    <div className="relative w-[56px] select-none" style={{ height: ITEM_H * VISIBLE }} aria-label={ariaLabel}>
      {/* Selection band */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 rounded-lg bg-accent-soft border border-accent/25"
        style={{ top: ITEM_H * PAD, height: ITEM_H }}
      />
      {/* Fade masks */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-[var(--surface-1)] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-[var(--surface-1)] to-transparent" />

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
              onClick={() => {
                onChange(n);
                scrollerRef.current?.scrollTo({ top: items.indexOf(n) * ITEM_H, behavior: "smooth" });
              }}
              className={clsx(
                "w-full snap-center flex items-center justify-center text-sm tabular-nums transition-colors duration-150",
                active ? "text-primary font-semibold" : "text-secondary"
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

// Glass calendar + Apple-style rolling time wheels.
export function DateTimePicker({ value, onChange, className }: DateTimePickerProps) {
  const initial = value ?? new Date();
  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const selected = value;

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
  const hour = selected?.getHours() ?? 9;
  const minute = selected?.getMinutes() ?? 0;

  function pickDay(day: Date) {
    const next = new Date(day);
    next.setHours(hour, minute, 0, 0);
    onChange(next);
  }

  function setTime(h: number, m: number) {
    const base = selected ? new Date(selected) : new Date();
    base.setHours(h, m, 0, 0);
    onChange(base);
  }

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className={clsx("rounded-xl border border-border glass p-3 space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-lg p-1.5 text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-medium text-primary text-center flex-1">{monthLabel}</p>
        <button
          type="button"
          className="rounded-lg p-1.5 text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-secondary py-1">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const isSelected = selected ? sameDay(day, selected) : false;
          const isToday = sameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => pickDay(day)}
              className={clsx(
                "h-8 rounded-lg text-xs transition-colors",
                isSelected
                  ? "bg-accent text-surface-0 font-medium"
                  : isToday
                    ? "text-accent bg-accent-soft font-medium"
                    : "text-primary hover:bg-surface-2"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="pt-2 border-t border-border space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-secondary text-center">Time</p>
        <div className="flex items-center justify-center gap-1 rounded-xl border border-border bg-surface-1/60 px-3 py-1">
          <RollingColumn
            items={HOURS}
            value={hour}
            onChange={(h) => setTime(h, minute)}
            ariaLabel="Hour"
          />
          <span className="text-primary font-semibold text-base pb-0.5">:</span>
          <RollingColumn
            items={MINUTES}
            value={minute}
            onChange={(m) => setTime(hour, m)}
            ariaLabel="Minute"
          />
          {selected && (
            <button
              type="button"
              className="ml-2 text-xs text-secondary hover:text-primary transition-colors"
              onClick={() => onChange(null)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
