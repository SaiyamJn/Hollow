import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

/** Shared empty / all-clear panel — accent icon well + calm copy. */
export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border",
        "glass py-14 px-6 text-center shadow-card",
        className
      )}
    >
      <div className="icon-well h-12 w-12 rounded-2xl">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-semibold text-primary">{title}</p>
        {subtitle ? <p className="text-xs text-secondary leading-relaxed">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
