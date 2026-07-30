import { FormEvent, useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  minLength?: number;
  /** Return null on success, or an error message to display. */
  onSubmit: (password: string) => Promise<string | null>;
}

// Shared by unlock prompts (verify a password) and lock actions (set one).
export function PasswordDialog({ open, onOpenChange, title, submitLabel, minLength, onSubmit }: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onSubmit(password);
    setBusy(false);
    if (result) {
      setError(result);
    } else {
      setPassword("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setPassword("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent title={title}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={minLength}
            autoFocus
            required
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" variant="accent" className="w-full" disabled={busy}>
            {busy ? "…" : submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
