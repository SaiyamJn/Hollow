import clsx from "clsx";
import type { TaskRepeatRule } from "../lib/types";
import {
  UNIT_OPTIONS,
  WEEKDAY_OPTIONS,
  clampInterval,
  defaultWeeklyDays,
  formatRepeatLabel,
  normalizeRepeatDays,
  normalizeRepeatEnd,
  type RepeatEnd,
} from "../lib/taskRepeat";

export type RepeatDraft = {
  repeat: TaskRepeatRule | null;
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: RepeatEnd | null;
  repeatUntil?: Date | null;
  repeatCount?: number | null;
};

export function repeatPayload(draft: {
  due: Date | null;
  repeat: TaskRepeatRule | null;
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: RepeatEnd | null;
  repeatUntil?: Date | null;
  repeatCount?: number | null;
}) {
  if (!draft.due || !draft.repeat) {
    return {
      repeatRule: null as TaskRepeatRule | null,
      repeatDays: null as number[] | null,
      repeatInterval: 1,
      repeatEnd: null as RepeatEnd | null,
      repeatUntil: null as string | null,
      repeatCount: null as number | null,
    };
  }
  const end = normalizeRepeatEnd(draft.repeatEnd);
  return {
    repeatRule: draft.repeat,
    repeatDays:
      draft.repeat === "weekly"
        ? normalizeRepeatDays(draft.repeatDays) ?? defaultWeeklyDays(draft.due)
        : null,
    repeatInterval: clampInterval(draft.repeatInterval ?? 1),
    repeatEnd: end,
    repeatUntil: end === "on" && draft.repeatUntil ? draft.repeatUntil.toISOString() : null,
    repeatCount: end === "after" ? Math.min(999, Math.max(1, Math.floor(draft.repeatCount ?? 30))) : null,
  };
}

/** Hollow rhythm panel for web — interval, weekdays, and series end. */
export function RepeatPanel({
  due,
  value,
  onChange,
}: {
  due: Date | null;
  value: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
}) {
  const active = !!value.repeat;
  const interval = clampInterval(value.repeatInterval ?? 1);
  const rule = value.repeat ?? "daily";
  const weeklyDays = normalizeRepeatDays(value.repeatDays) ?? defaultWeeklyDays(due);
  const end = normalizeRepeatEnd(value.repeatEnd);
  const count = value.repeatCount && value.repeatCount > 0 ? value.repeatCount : 30;

  function setRule(next: TaskRepeatRule | null) {
    if (!next) {
      onChange({
        repeat: null,
        repeatDays: null,
        repeatInterval: 1,
        repeatEnd: null,
        repeatUntil: null,
        repeatCount: null,
      });
      return;
    }
    onChange({
      ...value,
      repeat: next,
      repeatInterval: interval,
      repeatDays: next === "weekly" ? weeklyDays : null,
      repeatEnd: value.repeatEnd ?? "never",
      repeatUntil: value.repeatEnd === "on" ? value.repeatUntil ?? null : null,
      repeatCount: value.repeatEnd === "after" ? count : null,
    });
  }

  function setEnd(next: RepeatEnd) {
    const until =
      next === "on"
        ? value.repeatUntil ??
          (() => {
            const d = due ? new Date(due) : new Date();
            d.setMonth(d.getMonth() + 1);
            return d;
          })()
        : null;
    onChange({
      ...value,
      repeat: rule,
      repeatEnd: next,
      repeatUntil: until,
      repeatCount: next === "after" ? count : null,
    });
  }

  const summary = formatRepeatLabel({
    rule: value.repeat,
    days: value.repeatDays,
    interval: value.repeatInterval,
    end: value.repeatEnd,
    until: value.repeatUntil,
    count: value.repeatCount,
  });

  return (
    <div className="space-y-4 text-left">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Rhythm</p>
        <p className="text-sm font-semibold text-primary mt-1">{summary}</p>
      </div>

      <button
        type="button"
        onClick={() => setRule(null)}
        className={clsx(
          "w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
          !active ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-primary hover:bg-surface-2/50"
        )}
      >
        Doesn't repeat
      </button>

      <div>
        <p className="text-xs font-semibold text-secondary mb-2">Repeats every</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border glass-input px-1 py-1">
            <button
              type="button"
              className="h-8 w-8 rounded-lg text-primary hover:bg-surface-2"
              onClick={() => active && onChange({ ...value, repeat: rule, repeatInterval: clampInterval(interval - 1) })}
            >
              −
            </button>
            <span className="min-w-[1.75rem] text-center text-sm font-semibold">{interval}</span>
            <button
              type="button"
              className="h-8 w-8 rounded-lg text-primary hover:bg-surface-2"
              onClick={() => active && onChange({ ...value, repeat: rule, repeatInterval: clampInterval(interval + 1) })}
            >
              +
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {UNIT_OPTIONS.map((u) => {
              const on = active && rule === u.value;
              return (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => setRule(u.value)}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    on
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-secondary hover:text-primary"
                  )}
                >
                  {interval === 1 ? u.singular : u.plural}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {active && rule === "weekly" && (
        <div>
          <p className="text-xs font-semibold text-secondary mb-2">On these days</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((d) => {
              const on = weeklyDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  title={d.label}
                  onClick={() => {
                    const set = new Set(weeklyDays);
                    if (on) {
                      if (set.size <= 1) return;
                      set.delete(d.value);
                    } else set.add(d.value);
                    onChange({
                      ...value,
                      repeat: "weekly",
                      repeatDays: [...set].sort((a, b) => a - b),
                    });
                  }}
                  className={clsx(
                    "h-8 w-8 rounded-full text-xs font-semibold transition-colors",
                    on
                      ? "bg-accent text-surface-0"
                      : "border border-border text-secondary hover:border-secondary hover:text-primary"
                  )}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {active && (
        <>
          <div>
            <p className="text-xs font-semibold text-secondary mb-2">Begins</p>
            <div className="rounded-xl border border-border glass-input px-3 py-2.5 text-sm text-primary">
              {due
                ? due.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })
                : "Pick a due date first"}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-secondary mb-2">Keeps going</p>
            <div className="space-y-2">
              {(
                [
                  { id: "never" as const, label: "Forever", hint: "No end in sight" },
                  { id: "on" as const, label: "Until a day", hint: "Stop on a date" },
                  { id: "after" as const, label: "A set number", hint: "Then call it done" },
                ] as const
              ).map((opt) => {
                const on = end === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEnd(opt.id)}
                    className={clsx(
                      "w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      on ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2/40"
                    )}
                  >
                    <span
                      className={clsx(
                        "h-4 w-4 rounded-full border-2 shrink-0",
                        on ? "border-accent bg-accent" : "border-secondary"
                      )}
                    />
                    <span className="flex-1 min-w-0">
                      <span className={clsx("block text-sm", on ? "text-accent font-semibold" : "text-primary")}>
                        {opt.label}
                      </span>
                      <span className="block text-[11px] text-secondary">{opt.hint}</span>
                    </span>
                    {opt.id === "on" && on && (
                      <input
                        type="date"
                        className="rounded-lg border border-border glass-input px-2 py-1 text-xs text-primary"
                        value={
                          value.repeatUntil
                            ? `${value.repeatUntil.getFullYear()}-${String(value.repeatUntil.getMonth() + 1).padStart(2, "0")}-${String(value.repeatUntil.getDate()).padStart(2, "0")}`
                            : ""
                        }
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const [y, m, d] = e.target.value.split("-").map(Number);
                          onChange({
                            ...value,
                            repeat: rule,
                            repeatEnd: "on",
                            repeatUntil: new Date(y, m - 1, d),
                            repeatCount: null,
                          });
                        }}
                      />
                    )}
                    {opt.id === "after" && on && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md text-primary hover:bg-surface-2"
                          onClick={() =>
                            onChange({
                              ...value,
                              repeat: rule,
                              repeatEnd: "after",
                              repeatCount: Math.max(1, count - 1),
                            })
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={count}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            onChange({
                              ...value,
                              repeat: rule,
                              repeatEnd: "after",
                              repeatCount: Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1,
                            });
                          }}
                          className="w-14 rounded-lg border border-border glass-input px-2 py-1 text-center text-sm font-semibold"
                        />
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md text-primary hover:bg-surface-2"
                          onClick={() =>
                            onChange({
                              ...value,
                              repeat: rule,
                              repeatEnd: "after",
                              repeatCount: Math.min(999, count + 1),
                            })
                          }
                        >
                          +
                        </button>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
