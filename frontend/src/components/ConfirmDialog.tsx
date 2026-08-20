import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  confirmBusy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmBusy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <div className="space-y-3">
          <p className="text-sm text-secondary whitespace-pre-wrap">{message}</p>
          <div className="flex gap-2">
            <Button className="flex-1" variant="ghost" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button className="flex-1" disabled={confirmBusy} onClick={onConfirm}>
              <span className="text-danger">{confirmBusy ? "…" : confirmLabel}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
