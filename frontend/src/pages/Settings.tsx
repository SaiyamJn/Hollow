import { useEffect, useState } from "react";
import { Bell, BellOff, KeyRound, Moon, Pencil, Sun } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../theme/ThemeProvider";
import { useFont } from "../theme/FontProvider";
import { useAuthStore } from "../stores/auth";
import { useUnlockStore } from "../stores/unlock";
import { disconnectSocket } from "../lib/socket";
import {
  fetchAuthSessions,
  fetchHealth,
  logoutAuthSession,
  revokeAuthSession,
  revokeOtherAuthSessions,
} from "../lib/api";
import {
  APP_BUILD,
  APP_COPYRIGHT,
  APP_NAME,
  APP_PLATFORM,
  APP_TAGLINE,
  APP_VERSION,
} from "../lib/appInfo";
import { FONT_OPTIONS } from "../lib/fonts";
import { remindersPref, setRemindersEnabled } from "../lib/notify";
import {
  KEYBIND_DEFS,
  comboFromEvent,
  formatCombo,
  useKeybindsStore,
  type KeybindId,
} from "../lib/keybinds";
import { AccountAvatar, ChangePasswordDialog, EditProfileDialog } from "../components/AccountDialogs";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { theme, toggle } = useTheme();
  const { font, setFont } = useFont();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearUnlocks = useUnlockStore((s) => s.clearAll);
  const navigate = useNavigate();
  const [reminders, setReminders] = useState(remindersPref());
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  const binds = useKeybindsStore((s) => s.binds);
  const setBind = useKeybindsStore((s) => s.setBind);
  const resetDefaults = useKeybindsStore((s) => s.resetDefaults);
  const [recording, setRecording] = useState<KeybindId | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);

  useEffect(() => {
    if (recording) document.body.dataset.recordingKeybind = "1";
    else delete document.body.dataset.recordingKeybind;
    return () => {
      delete document.body.dataset.recordingKeybind;
    };
  }, [recording]);

  useEffect(() => {
    if (!recording) return;

    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(null);
        setBindError(null);
        return;
      }

      const combo = comboFromEvent(e);
      if (!combo) return;

      const result = setBind(recording!, combo);
      if (!result.ok) {
        const other = KEYBIND_DEFS.find((d) => d.id === result.conflict)?.label ?? "another action";
        setBindError(`Already used by “${other}”. Pick a different combo.`);
        return;
      }
      setBindError(null);
      setRecording(null);
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, setBind]);

  async function toggleReminders() {
    setReminderError(null);
    const next = !reminders;
    const effective = await setRemindersEnabled(next);
    setReminders(effective);
    if (next && !effective) {
      setReminderError("Notifications are blocked for this site — allow them in your browser settings.");
    }
  }

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
    staleTime: 60_000,
  });

  const {
    data: sessions,
    refetch: refetchSessions,
    isFetching: sessionsLoading,
    error: sessionsError,
  } = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: fetchAuthSessions,
    staleTime: 15_000,
  });

  function onAccountSaved(revoked: number) {
    void refetchSessions();
    setAccountNotice(
      revoked === 0
        ? "Saved. This browser stays signed in."
        : `Saved. Signed out ${revoked} other device${revoked === 1 ? "" : "s"}.`
    );
  }

  async function signOutLocal() {
    try {
      await logoutAuthSession();
    } catch {
      // ignore — still clear local state
    }
    clearUnlocks();
    disconnectSocket();
    logout();
    navigate("/login", { replace: true });
  }

  async function onRevokeSession(id: string, current: boolean) {
    const label = current ? "Log out of this browser?" : "Sign out this device?";
    if (!window.confirm(label)) return;
    try {
      const res = await revokeAuthSession(id);
      if (res.current) {
        clearUnlocks();
        disconnectSocket();
        logout();
        navigate("/login", { replace: true });
        return;
      }
      void refetchSessions();
    } catch (err: any) {
      window.alert(err?.response?.data?.error ?? "Couldn't sign out that device.");
    }
  }

  async function onRevokeOthers() {
    if (!window.confirm("Sign out every other device? This browser stays signed in.")) return;
    try {
      const res = await revokeOtherAuthSessions();
      void refetchSessions();
      window.alert(
        res.revoked === 0
          ? "No other devices were signed in."
          : `Signed out ${res.revoked} other device${res.revoked === 1 ? "" : "s"}.`
      );
    } catch (err: any) {
      window.alert(err?.response?.data?.error ?? "Couldn't sign out other devices.");
    }
  }

  function relativeTime(iso: string) {
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms) || ms < 0) return "just now";
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  const sessionList = sessions ?? [];
  const otherCount = sessionList.filter((s) => !s.current).length;

  return (
    <div className="max-w-lg mx-auto px-7 py-10 space-y-4">
      <div className="text-center mb-2">
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="text-sm text-secondary mt-1">Make it feel like yours.</p>
      </div>

      <section className="rounded-2xl border border-border glass-strong p-5 shadow-card text-center space-y-3 panel-accent">
        <h2 className="section-label justify-center mb-1">Account</h2>
        <div className="flex flex-col items-center gap-3 pt-1">
          <AccountAvatar name={user?.name} size="lg" />
          <div className="min-w-0 max-w-full">
            <p className="text-base font-medium text-primary tracking-tight truncate">{user?.name}</p>
            <p className="text-sm text-secondary mt-1 break-all">
              {user?.username ? `@${user.username}` : null}
              {user?.username && user?.email ? " · " : null}
              {user?.email}
            </p>
          </div>
        </div>
        {accountNotice && <p className="text-sm text-accent">{accountNotice}</p>}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button onClick={() => setProfileOpen(true)}>
            <Pencil size={16} />
            Profile
          </Button>
          <Button onClick={() => setPasswordOpen(true)}>
            <KeyRound size={16} />
            Change password
          </Button>
        </div>
        <EditProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          onSaved={({ revoked }) => onAccountSaved(revoked)}
        />
        <ChangePasswordDialog
          open={passwordOpen}
          onOpenChange={setPasswordOpen}
          onSaved={({ revoked }) => onAccountSaved(revoked)}
        />
      </section>

      <section className="rounded-2xl border border-border glass-strong p-5 shadow-card text-center space-y-3">
        <div>
          <h2 className="section-label justify-center mb-1">Theme</h2>
          <p className="text-sm text-secondary mt-0.5">Currently {theme}</p>
        </div>
        <Button onClick={toggle}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </section>

      <section className="rounded-2xl border border-border glass-strong p-5 shadow-card text-center space-y-3">
        <div>
          <h2 className="section-label justify-center mb-1">Font</h2>
          <p className="text-sm text-secondary mt-0.5">The voice of your words on screen</p>
        </div>
        <select
          className="w-full rounded-lg border border-border glass-input px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-accent"
          value={font}
          onChange={(e) => setFont(e.target.value as typeof font)}
          style={{ fontFamily: FONT_OPTIONS.find((o) => o.id === font)?.family }}
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id} style={{ fontFamily: opt.family }}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-2xl border border-border glass-strong p-5 shadow-card text-center space-y-3">
        <div>
          <h2 className="section-label justify-center mb-1">Task reminders</h2>
          <p className="text-sm text-secondary mt-0.5">
            A little tap on the shoulder when something's due (while you're here)
          </p>
          {reminderError && <p className="text-sm text-danger mt-2">{reminderError}</p>}
        </div>
        <Button onClick={() => void toggleReminders()}>
          {reminders ? <Bell size={16} /> : <BellOff size={16} />}
          {reminders ? "On" : "Off"}
        </Button>
      </section>

      <section className="rounded-2xl border border-border glass-strong p-5 shadow-card space-y-3 text-center">
        <div>
          <h2 className="section-label justify-center mb-1">Keyboard shortcuts</h2>
          <p className="text-sm text-secondary mt-0.5">
            Click a shortcut to rebind it. Esc cancels.
          </p>
          <Button
            className="mt-2"
            onClick={() => {
              resetDefaults();
              setRecording(null);
              setBindError(null);
            }}
          >
            Reset
          </Button>
        </div>

        <ul className="space-y-1 text-left">
          {KEYBIND_DEFS.map((def) => {
            const active = recording === def.id;
            return (
              <li key={def.id} className="flex items-center justify-between gap-4 text-sm py-1.5">
                <span className="text-sm text-secondary">{def.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    setBindError(null);
                    setRecording(active ? null : def.id);
                  }}
                  className={
                    active
                      ? "shrink-0 rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-xs text-accent font-medium animate-pulse-soft"
                      : "shrink-0 rounded-md border border-border glass-input px-2.5 py-1 text-xs text-primary font-medium hover:border-accent hover:text-accent transition-colors"
                  }
                >
                  {active ? "Press keys…" : formatCombo(binds[def.id])}
                </button>
              </li>
            );
          })}
        </ul>
        {bindError && <p className="text-sm text-danger">{bindError}</p>}
      </section>

      <section className="rounded-2xl border border-border glass-strong p-5 shadow-card space-y-3">
        <div className="text-center">
          <h2 className="section-label justify-center mb-1">Devices</h2>
          <p className="text-sm text-secondary mt-0.5">
            Where this account is signed in. Sign out remotely anytime.
          </p>
        </div>
        {sessionsError ? (
          <p className="text-sm text-danger text-center">
            Couldn&apos;t load devices. Sign in again after updating the server.
          </p>
        ) : sessionsLoading && !sessions ? (
          <p className="text-sm text-secondary text-center">Loading…</p>
        ) : (
          <ul className="divide-y divide-border text-left">
            {sessionList.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-primary truncate">{s.deviceName}</span>
                    {s.current && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-accent bg-accent-soft px-1.5 py-0.5 rounded-full">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary mt-0.5">
                    Active {relativeTime(s.lastSeenAt)} · signed in {relativeTime(s.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onRevokeSession(s.id, s.current)}
                  className="shrink-0 text-sm text-danger font-medium hover:underline"
                >
                  {s.current ? "Log out" : "Sign out"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-secondary text-center">
          {sessionList.length} device{sessionList.length === 1 ? "" : "s"} signed in
        </p>
        {otherCount > 0 && (
          <div className="flex justify-center">
            <Button onClick={() => void onRevokeOthers()}>
              Sign out {otherCount} other device{otherCount === 1 ? "" : "s"}
            </Button>
          </div>
        )}
        <div className="flex justify-center pt-1">
          <Button onClick={() => void signOutLocal()}>Log out of this browser</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border glass-strong p-5 shadow-card text-center space-y-4">
        <div className="flex flex-col items-center gap-3">
          <BrandMark size="xl" />
          <div>
            <h2 className="text-base font-medium tracking-tight text-primary">{APP_NAME}</h2>
            <p className="text-sm text-secondary max-w-xs mt-1">{APP_TAGLINE}</p>
          </div>
        </div>

        <dl className="text-left text-sm space-y-2 border-t border-border pt-4">
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Version</dt>
            <dd className="text-primary font-medium tabular-nums">{APP_VERSION}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Build</dt>
            <dd className="text-primary tabular-nums">{APP_BUILD}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Client</dt>
            <dd className="text-primary">{APP_PLATFORM}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Server</dt>
            <dd className="text-primary tabular-nums">
              {health?.ok
                ? `${health.name ?? "Hollow"} ${health.version ?? "—"}`
                : health === undefined
                  ? "Checking…"
                  : "Unavailable"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-secondary">Encryption</dt>
            <dd className="text-primary">AES-256-GCM at rest</dd>
          </div>
        </dl>

        <p className="text-xs text-secondary border-t border-border pt-3">{APP_COPYRIGHT}</p>
      </section>
    </div>
  );
}
