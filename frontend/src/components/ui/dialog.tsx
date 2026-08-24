import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export const Dialog = DialogPrimitive.Root;

export function DialogContent({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/80 sm:bg-black/65 sm:backdrop-blur-[3px] animate-fade-in" />
      <DialogPrimitive.Content
        data-hollow-dialog=""
        className={clsx(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2",
          "rounded-2xl border border-border bg-[var(--surface-1)] p-6 text-primary shadow-pop",
          "max-h-[min(90dvh,44rem)] overflow-y-auto overscroll-contain overflow-x-hidden",
          "focus:outline-none animate-pop-in",
          className
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <DialogPrimitive.Title className="text-sm font-medium text-center flex-1 pr-2">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="text-secondary hover:text-primary shrink-0">
            <X size={16} />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
