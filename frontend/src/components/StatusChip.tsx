import clsx from "clsx";
import { formatDueLabel } from "./DateTimePicker";

function classifyDue(iso: string): "overdue" | "today" | "upcoming" {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "upcoming";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (due < start) return "overdue";
  if (due < end) return "today";
  return "upcoming";
}

/** Soft due / overdue / today pill used in lists and home. */
export function DueChip({
  dueAt,
  className,
  prefix,
}: {
  dueAt: string;
  className?: string;
  /** Extra label after the date, e.g. repeat summary */
  prefix?: string;
}) {
  const kind = classifyDue(dueAt);
  return (
    <span
      className={clsx(
        "status-chip",
        kind === "overdue" && "status-chip-danger",
        kind === "today" && "status-chip-accent",
        kind === "upcoming" && "status-chip-muted",
        className
      )}
    >
      {kind === "overdue" ? "Overdue · " : kind === "today" ? "Today · " : ""}
      {formatDueLabel(dueAt)}
      {prefix ? ` · ${prefix}` : ""}
    </span>
  );
}

export function StatusChip({
  tone = "muted",
  children,
  className,
}: {
  tone?: "accent" | "danger" | "warn" | "muted";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "status-chip",
        tone === "accent" && "status-chip-accent",
        tone === "danger" && "status-chip-danger",
        tone === "warn" && "status-chip-warn",
        tone === "muted" && "status-chip-muted",
        className
      )}
    >
      {children}
    </span>
  );
}
