import clsx from "clsx";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<Size, number> = {
  sm: 22,
  md: 28,
  lg: 40,
  xl: 56,
};

// Squircle-ish radius so the mark reads like a modern app icon.
const RADIUS: Record<Size, string> = {
  sm: "rounded-[7px]",
  md: "rounded-[9px]",
  lg: "rounded-[12px]",
  xl: "rounded-[16px]",
};

interface BrandMarkProps {
  size?: Size;
  /** Show the “Hollow” wordmark beside the mark */
  wordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

/** Hollow logo mark — uses /hollow-logo.png from public/. */
export function BrandMark({
  size = "md",
  wordmark = false,
  className,
  wordmarkClassName,
}: BrandMarkProps) {
  const px = SIZE_PX[size];
  return (
    <span className={clsx("inline-flex items-center gap-2.5 min-w-0", className)}>
      <img
        src="/hollow-logo.png"
        alt=""
        width={px}
        height={px}
        draggable={false}
        className={clsx(
          "shrink-0 object-cover select-none",
          RADIUS[size],
          "ring-1 ring-black/[0.06] dark:ring-white/[0.08]",
          "shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
        )}
      />
      {wordmark && (
        <span
          className={clsx(
            "font-medium tracking-tight text-primary truncate",
            size === "sm" && "text-sm",
            size === "md" && "text-sm",
            size === "lg" && "text-lg",
            size === "xl" && "text-xl",
            wordmarkClassName
          )}
        >
          Hollow
        </span>
      )}
    </span>
  );
}
