import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

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
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 animate-fade-in" />
      <DialogPrimitive.Content
        data-hollow-dialog=""
        className={clsx(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2",
          "rounded-2xl border border-border glass-strong p-6 text-primary shadow-pop",
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
