/** Hollow focus classes — important × urgent, in app voice. */

export type TaskFocus = "none" | "critical" | "steady" | "swift" | "quiet";

export function normalizeFocus(value: string | null | undefined): TaskFocus {
  if (value === "critical" || value === "steady" || value === "swift" || value === "quiet") {
    return value;
  }
  return "none";
}

export function focusRank(focus: TaskFocus | string | null | undefined): number {
  switch (normalizeFocus(focus)) {
    case "critical":
      return 4;
    case "steady":
      return 3;
    case "swift":
      return 2;
    case "quiet":
      return 1;
    default:
      return 0;
  }
}

export function compareTaskPriority<
  T extends {
    done?: boolean;
    starred?: boolean;
    focus?: string | null;
    dueAt?: Date | string | null;
    createdAt?: Date | string;
  },
>(a: T, b: T): number {
  if (!!a.done !== !!b.done) return a.done ? 1 : -1;
  const starA = a.starred ? 1 : 0;
  const starB = b.starred ? 1 : 0;
  if (starA !== starB) return starB - starA;
  const rankA = focusRank(a.focus);
  const rankB = focusRank(b.focus);
  if (rankA !== rankB) return rankB - rankA;
  const ta = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
  const tb = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return cb - ca;
}

