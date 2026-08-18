import { FormEvent, useEffect, useState } from "react";
import { updateAccount } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

function initialsFromName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "";
  return (first + second).toUpperCase();
}

export function AccountAvatar({ name, size = "md" }: { name?: string | null; size?: "md" | "lg" }) {
  const px = size === "lg" ? "h-14 w-14 text-lg rounded-2xl" : "h-11 w-11 text-sm rounded-xl";
  return (
    <div
      className={`inline-flex items-center justify-center font-medium tracking-wide bg-accent-soft text-accent ring-1 ring-accent/20 ${px}`}
    >
      {initialsFromName(name)}
    </div>
  );
}

type Saved = { revoked: number };

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: Saved) => void;
}

export function EditProfileDialog({ open, onOpenChange, onSaved }: DialogProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name);
    setUsername(user.username);
    setEmail(user.email);
    setError(null);
  }, [open, user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const patch: {
      name?: string;
      username?: string;
      email?: string;
    } = {};
    if (name.trim() !== user.name) patch.name = name.trim();
    if (username.trim().toLowerCase() !== user.username) patch.username = username.trim();
    if (email.trim().toLowerCase() !== user.email) patch.email = email.trim();

    if (!patch.name && !patch.username && !patch.email) {
      setError("Nothing to update.");
      return;
    }

    setBusy(true);
    try {
      const res = await updateAccount(patch);
      setUser(res.user);
      onSaved({ revoked: res.revoked });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Couldn't update profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit profile">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <label className="block text-left">
            <span className="text-xs text-secondary">Display name</span>
            <Input className="mt-1" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>
          <label className="block text-left">
            <span className="text-xs text-secondary">Username</span>
            <Input
              className="mt-1"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[A-Za-z0-9_]{3,32}"
              maxLength={32}
              title="3–32 characters: letters, numbers, underscores"
              required
            />
          </label>
          <label className="block text-left">
            <span className="text-xs text-secondary">Email</span>
            <Input className="mt-1" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <p className="text-xs text-secondary text-center">Other devices will be signed out.</p>
          {error && <p className="text-sm text-danger text-center">{error}</p>}
          <Button type="submit" variant="accent" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChangePasswordDialog({ open, onOpenChange, onSaved }: DialogProps) {
  const setUser = useAuthStore((s) => s.setUser);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don’t match.");
      return;
    }

    setBusy(true);
    try {
      const res = await updateAccount({ currentPassword, newPassword });
      setUser(res.user);
      onSaved({ revoked: res.revoked });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Couldn't change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Change password">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <label className="block text-left">
            <span className="text-xs text-secondary">Current password</span>
            <Input
              className="mt-1"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="block text-left">
            <span className="text-xs text-secondary">New password</span>
            <Input
              className="mt-1"
              type="password"
              autoComplete="new-password"
              placeholder="Min 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="block text-left">
            <span className="text-xs text-secondary">Re-enter new password</span>
            <Input
              className="mt-1"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <p className="text-xs text-secondary text-center">Other devices will be signed out.</p>
          {error && <p className="text-sm text-danger text-center">{error}</p>}
          <Button type="submit" variant="accent" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
