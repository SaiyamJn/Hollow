import clsx from "clsx";
import {
  FOCUS_DOT,
  FOCUS_MATRIX,
  FOCUS_META,
  FOCUS_PANE,
  FOCUS_TEXT,
  normalizeFocus,
  type TaskFocus,
} from "../lib/taskFocus";

/** Desktop: important × urgent matrix — glass tiles, Hollow labels. */
export function FocusField({
  value,
  onChange,
}: {
  value: TaskFocus | string | null | undefined;
  onChange: (next: TaskFocus) => void;
}) {
  const current = normalizeFocus(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-secondary tracking-wide uppercase">Focus</p>
        {current !== "none" && (
          <button
            type="button"
            onClick={() => onChange("none")}
            className="text-xs text-secondary hover:text-primary"
          >
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FOCUS_MATRIX.map((id) => {
          const meta = FOCUS_META[id];
          const active = current === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(active ? "none" : id)}
              className={clsx(
                "rounded-xl px-3 py-2.5 text-left transition-all",
                FOCUS_PANE[id],
                active && "ring-2 ring-[color:var(--pane-accent)]/45 scale-[1.01]"
              )}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={clsx("h-2 w-2 rounded-full shrink-0", FOCUS_DOT[id])} />
                <span className={clsx("text-sm font-semibold", FOCUS_TEXT[id])}>{meta.label}</span>
              </div>
              <p className="text-[11px] text-secondary leading-snug pl-4">{meta.hint}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-secondary/80 text-center">
        Left = urgent · Right = not · Top = important
      </p>
    </div>
  );
}

/** Small list-row marker. */
export function FocusDot({
  focus,
  className,
}: {
  focus: TaskFocus | string | null | undefined;
  className?: string;
}) {
  const id = normalizeFocus(focus);
  if (id === "none") return null;
  return (
    <span
      title={FOCUS_META[id].hint}
      className={clsx("inline-block h-2 w-2 rounded-full shrink-0", FOCUS_DOT[id], className)}
    />
  );
}

export function FocusChip({
  focus,
  className,
}: {
  focus: TaskFocus | string | null | undefined;
  className?: string;
}) {
  const id = normalizeFocus(focus);
  if (id === "none") return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        "focus-pill",
        `focus-pill-${id}`,
        FOCUS_TEXT[id],
        className
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", FOCUS_DOT[id])} />
      {FOCUS_META[id].label}
    </span>
  );
}
