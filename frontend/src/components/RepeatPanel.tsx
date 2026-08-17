import clsx from "clsx";
import { useState } from "react";
import { Repeat } from "lucide-react";
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
import { Button } from "./ui/button";

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

function RepeatEditor({
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary truncate">
        {formatRepeatLabel({
          rule: value.repeat,
          days: value.repeatDays,
          interval: value.repeatInterval,
          end: value.repeatEnd,
          until: value.repeatUntil,
          count: value.repeatCount,
        })}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setRule(null)}
          className={clsx(
            "rounded-full border px-3 py-1.5 text-xs font-semibold",
            !active ? "border-accent bg-accent-soft text-accent" : "border-border text-secondary"
          )}
        >
          Off
        </button>
        {UNIT_OPTIONS.map((u) => {
          const on = active && rule === u.value;
          return (
            <button
              key={u.value}
              type="button"
              onClick={() => setRule(u.value)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                on ? "border-accent bg-accent-soft text-accent" : "border-border text-secondary"
              )}
            >
              {u.singular}
            </button>
          );
        })}
      </div>

      {active && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-secondary flex-1">Every</span>
            <div className="inline-flex items-center rounded-lg border border-border glass-input">
              <button
                type="button"
                className="h-8 w-8 text-primary"
                onClick={() => onChange({ ...value, repeat: rule, repeatInterval: clampInterval(interval - 1) })}
              >
                −
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-semibold">{interval}</span>
              <button
                type="button"
                className="h-8 w-8 text-primary"
                onClick={() => onChange({ ...value, repeat: rule, repeatInterval: clampInterval(interval + 1) })}
              >
                +
              </button>
            </div>
            <span className="text-sm text-primary font-medium w-14">
              {interval === 1
                ? UNIT_OPTIONS.find((u) => u.value === rule)?.singular
                : UNIT_OPTIONS.find((u) => u.value === rule)?.plural}
            </span>
          </div>

          {rule === "weekly" && (
            <div className="flex flex-wrap gap-1.5 justify-between">
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
                      "h-8 w-8 rounded-full text-xs font-semibold",
                      on ? "bg-accent text-surface-0" : "border border-border text-secondary"
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-border glass-input p-1.5 space-y-1.5">
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: "never" as const, label: "Forever" },
                  { id: "on" as const, label: "Until" },
                  { id: "after" as const, label: "Times" },
                ] as const
              ).map((opt) => {
                const on = end === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEnd(opt.id)}
                    className={clsx(
                      "rounded-lg py-2 text-xs font-semibold",
                      on ? "bg-accent-soft text-accent" : "text-secondary hover:text-primary"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {end === "on" && (
              <input
                type="date"
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
                value={
                  value.repeatUntil
                    ? `${value.repeatUntil.getFullYear()}-${String(value.repeatUntil.getMonth() + 1).padStart(2, "0")}-${String(value.repeatUntil.getDate()).padStart(2, "0")}`
                    : ""
                }
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

            {end === "after" && (
              <div className="flex items-center gap-3 px-1 py-1">
                <span className="text-sm text-secondary flex-1">Stop after</span>
                <div className="inline-flex items-center rounded-lg border border-border">
                  <button
                    type="button"
                    className="h-8 w-8"
                    onClick={() =>
                      onChange({ ...value, repeat: rule, repeatEnd: "after", repeatCount: Math.max(1, count - 1) })
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
                    className="w-12 bg-transparent text-center text-sm font-semibold outline-none"
                  />
                  <button
                    type="button"
                    className="h-8 w-8"
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
                <span className="text-sm text-primary">times</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One-line trigger → expands an inline repeat editor (not a nested Dialog —
 * nesting Radix dialogs closed the parent task form before schedule could save).
 */
export function RepeatField({
  due,
  value,
  onChange,
  disabled,
}: {
  due: Date | null;
  value: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RepeatDraft>(value);

  function openPanel() {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  }

  const label = formatRepeatLabel({
    rule: value.repeat,
    days: value.repeatDays,
    interval: value.repeatInterval,
    end: value.repeatEnd,
    until: value.repeatUntil,
    count: value.repeatCount,
  });

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={clsx(
          "w-full flex items-center gap-2 rounded-lg border border-border glass-input px-3 py-2.5 text-left text-sm transition-colors",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-secondary",
          open && "border-accent/40"
        )}
      >
        <Repeat size={14} className="text-secondary shrink-0" />
        <span className="flex-1 min-w-0 truncate text-secondary">
          {disabled ? "Repeat (pick a date first)" : label}
        </span>
        <span className="text-secondary text-xs">{open ? "▾" : "›"}</span>
      </button>

      {open && !disabled && (
        <div className="rounded-xl border border-border bg-surface-1/80 p-3 space-y-3">
          <RepeatEditor due={due} value={draft} onChange={setDraft} />
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              variant="accent"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** @deprecated Prefer RepeatField — kept for any direct embeds. */
export function RepeatPanel(props: {
  due: Date | null;
  value: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
}) {
  return <RepeatEditor {...props} />;
}
