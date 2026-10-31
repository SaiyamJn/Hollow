import clsx from "clsx";
import { Input } from "./ui/input";

export function GroupSelector({
  value,
  onChange,
  availableGroups,
}: {
  value: string;
  onChange: (val: string) => void;
  availableGroups: string[];
}) {
  return (
    <div className="space-y-1.5 text-left">
      <div className="flex items-center justify-between text-xs text-secondary">
        <span className="font-medium uppercase tracking-wide text-[10px]">Group / Class</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="hover:text-primary transition-colors text-[11px]"
          >
            Clear
          </button>
        )}
      </div>
      <Input
        placeholder="Group (e.g. Work, Personal, School)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs"
      />
      {availableGroups.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {availableGroups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange(value === g ? "" : g)}
              className={clsx(
                "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
                value === g
                  ? "bg-accent-soft text-accent"
                  : "bg-surface-2/60 text-secondary hover:text-primary hover:bg-surface-2"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupFilterBar({
  groups,
  selected,
  onSelect,
  className,
}: {
  groups: string[];
  selected: string;
  onSelect: (group: string) => void;
  className?: string;
}) {
  if (groups.length === 0) return null;

  return (
    <div className={clsx("flex items-center justify-center gap-1.5 flex-wrap", className)}>
      {["All", ...groups].map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onSelect(g)}
          className={clsx(
            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
            selected === g
              ? "bg-accent-soft text-accent font-semibold shadow-xs"
              : "bg-surface-2/60 text-secondary hover:text-primary hover:bg-surface-2"
          )}
        >
          {g}
        </button>
      ))}
    </div>
  );
}
