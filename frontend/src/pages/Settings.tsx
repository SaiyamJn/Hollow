import { useEffect, useState } from "react";
import { Bell, BellOff, Moon, ShieldCheck, Sun } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../theme/ThemeProvider";
import { useAuthStore } from "../stores/auth";
import { useUnlockStore } from "../stores/unlock";
import { disconnectSocket } from "../lib/socket";
import { fetchAdminStats } from "../lib/api";
import { remindersPref, setRemindersEnabled } from "../lib/notify";
import {
  KEYBIND_DEFS,
  comboFromEvent,
  formatCombo,
  useKeybindsStore,
  type KeybindId,
} from "../lib/keybinds";
import { Button } from "../components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { theme, toggle } = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearUnlocks = useUnlockStore((s) => s.clearAll);
  const navigate = useNavigate();
  const [reminders, setReminders] = useState(remindersPref());
  const [reminderError, setReminderError] = useState<string | null>(null);

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

  const { data: adminStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
    retry: false,
  });

  return (
    <div className="max-w-lg mx-auto px-7 py-10 space-y-6">
      <h1 className="text-xl font-medium">Settings</h1>

      <section className="rounded-xl border border-border glass p-5 shadow-card text-center space-y-1">
        <h2 className="text-xs uppercase tracking-wide text-secondary mb-2">Account</h2>
        <p className="text-sm font-medium text-primary">{user?.name}</p>
        <p className="text-sm text-secondary">{user?.email}</p>
      </section>

      <section className="rounded-xl border border-border glass p-5 shadow-card flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-primary">Theme</h2>
          <p className="text-sm text-secondary mt-0.5">Currently {theme}</p>
        </div>
        <Button onClick={toggle}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </section>

      <section className="rounded-xl border border-border glass p-5 shadow-card flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-primary">Task reminders</h2>
          <p className="text-sm text-secondary mt-0.5">
            Notify me when a task is due (while the app is open)
          </p>
          {reminderError && <p className="text-sm text-danger mt-2">{reminderError}</p>}
        </div>
        <Button onClick={() => void toggleReminders()}>
          {reminders ? <Bell size={16} /> : <BellOff size={16} />}
          {reminders ? "On" : "Off"}
        </Button>
      </section>

      <section className="rounded-xl border border-border glass p-5 shadow-card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-primary">Keyboard shortcuts</h2>
            <p className="text-sm text-secondary mt-0.5">
              Click a shortcut to rebind it. Esc cancels. Navigation shortcuts are ignored while typing.
            </p>
          </div>
          <Button
            onClick={() => {
              resetDefaults();
              setRecording(null);
              setBindError(null);
            }}
          >
            Reset
          </Button>
        </div>

        <ul className="space-y-1">
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

      {adminStats && (
        <section className="rounded-xl border border-border glass p-5 shadow-card flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-primary flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-accent" /> Admin
            </h2>
            <p className="text-sm text-secondary mt-0.5">
              {adminStats.totals.users} {adminStats.totals.users === 1 ? "user" : "users"} on this server
            </p>
          </div>
          <Button onClick={() => navigate("/admin")}>Open dashboard</Button>
        </section>
      )}

      <section className="rounded-xl border border-border glass p-5 shadow-card space-y-3">
        <h2 className="text-sm font-medium text-primary">Session</h2>
        <p className="text-sm text-secondary">
          Your login token is kept in localStorage — acceptable for this self-hosted project, but not suitable
          for a high-security production deployment without hardening.
        </p>
        <Button
          onClick={() => {
            clearUnlocks();
            disconnectSocket();
            logout();
            navigate("/login", { replace: true });
          }}
        >
          Log out
        </Button>
      </section>
    </div>
  );
}
