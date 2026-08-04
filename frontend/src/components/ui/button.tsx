import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "default" | "accent" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  default: "border border-border glass hover:bg-surface-2/50 text-primary shadow-card",
  accent: "bg-accent text-surface-0 hover:brightness-110 shadow-card",
  ghost: "text-secondary hover:bg-surface-2 hover:text-primary",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", className, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium",
        "transition-all duration-150 active:scale-[0.98]",
        "focus-visible:outline-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        styles[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
