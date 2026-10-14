import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-lg border border-border glass-input px-3 py-1.5 text-sm text-primary",
        "placeholder:text-secondary transition-all duration-150",
        "focus:outline-none focus-visible:border-accent",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
