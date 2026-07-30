import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Minimize2, Moon, Search, Settings as SettingsIcon, Sun, LogOut } from "lucide-react";
import { useTheme } from "../theme/ThemeProvider";
import { useAuthStore } from "../stores/auth";
import { useUnlockStore } from "../stores/unlock";
import { useUiStore } from "../stores/ui";
import { disconnectSocket } from "../lib/socket";
import { fetchNotebooks, fetchTasks, openDailyNote } from "../lib/api";
import { notifyDueTasks } from "../lib/notify";
import { formatCombo, matchesCombo, useKeybindsStore, type KeybindId } from "../lib/keybinds";
import { Sidebar } from "../components/Sidebar";
import { CommandPalette } from "../components/CommandPalette";
import { QuickCreate } from "../components/QuickCreate";
import { Button } from "../components/ui/button";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export default function AppShell() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const clearUnlocks = useUnlockStore((s) => s.clearAll);
  const focusMode = useUiStore((s) => s.focusMode);
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const binds = useKeybindsStore((s) => s.binds);

  // Poll tasks so browser notifications fire while the app is open.
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks, refetchInterval: 60_000 });
  useEffect(() => {
    if (tasks) notifyDueTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    async function openDaily() {
      try {
        const note = await openDailyNote();
        queryClient.invalidateQueries({ queryKey: ["notebooks"] });
        navigate(`/notebooks/${note.notebookId}/sections/${note.sectionId}/pages/${note.id}`);
      } catch {
        // ignore
      }
    }

    async function openGraph() {
      const active = useUiStore.getState().activeNotebookId;
      if (active) {
        navigate(`/notebooks/${active}/graph`);
        return;
      }
      try {
        const notebooks = await queryClient.fetchQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
        if (notebooks[0]) navigate(`/notebooks/${notebooks[0].id}/graph`);
      } catch {
        // ignore
      }
    }

    const actions: Record<KeybindId, () => void> = {
      palette: () => setPaletteOpen(!useUiStore.getState().paletteOpen),
      home: () => navigate("/"),
      notebooks: () => navigate("/notebooks"),
      tasks: () => navigate("/tasks"),
      quickNotes: () => navigate("/quick-notes"),
      daily: () => void openDaily(),
      graph: () => void openGraph(),
      settings: () => navigate("/settings"),
      focus: () => setFocusMode(!useUiStore.getState().focusMode),
      theme: () => toggle(),
      escape: () => {
        if (useUiStore.getState().paletteOpen) setPaletteOpen(false);
        else if (useUiStore.getState().focusMode) setFocusMode(false);
      },
    };

    function onKey(e: KeyboardEvent) {
      // Don't steal keys while the user is remapping a shortcut in Settings.
      if (document.body.dataset.recordingKeybind === "1") return;

      const typing = isTypingTarget(e.target);
      const paletteOpen = useUiStore.getState().paletteOpen;
      const current = useKeybindsStore.getState().binds;

      // Match in a stable order so always-available binds win when needed.
      const order: KeybindId[] = [
        "escape",
        "palette",
        "home",
        "notebooks",
        "tasks",
        "quickNotes",
        "graph",
        "daily",
        "settings",
        "focus",
        "theme",
      ];

      for (const id of order) {
        const combo = current[id];
        if (!matchesCombo(e, combo)) continue;

        // Palette / escape always fire; others skip while typing or when palette is open.
        const always = id === "palette" || id === "escape";
        if (!always && (typing || paletteOpen)) continue;
        // Escape only does something useful when palette/focus is active
        if (id === "escape" && !paletteOpen && !useUiStore.getState().focusMode) continue;

        e.preventDefault();
        actions[id]();
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, queryClient, setFocusMode, setPaletteOpen, toggle, binds]);

  function onLogout() {
    clearUnlocks();
    disconnectSocket();
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="h-screen flex flex-col bg-surface-0 text-primary">
      <div className="flex-1 flex flex-col min-w-0 relative">
        {!focusMode && (
          <header className="absolute inset-x-0 top-0 z-20 h-12 glass-strong border-b border-border flex items-center justify-between px-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                title="Hollow"
                onClick={() => navigate("/")}
                className="flex items-center gap-2 pl-1"
              >
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-sm font-medium tracking-tight">Hollow</span>
              </button>
              <button
                className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs
                           text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
                onClick={() => setPaletteOpen(true)}
              >
                <Search size={13} />
                <span>Search or jump to…</span>
                <kbd className="border border-border rounded px-1 py-px text-[10px]">
                  {formatCombo(binds.palette)}
                </kbd>
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={toggle} title={`Toggle theme (${formatCombo(binds.theme)})`}>
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate("/settings")}
                title={`Settings (${formatCombo(binds.settings)})`}
              >
                <SettingsIcon size={16} />
              </Button>
              <Button variant="ghost" onClick={onLogout} title="Log out">
                <LogOut size={16} />
              </Button>
            </div>
          </header>
        )}
        <main className={clsx("flex-1 overflow-y-auto", !focusMode && "pt-12 pb-24")}>
          <Outlet />
        </main>
      </div>
      {!focusMode && <Sidebar />}
      {!focusMode && <QuickCreate />}
      {focusMode && (
        <button
          title={`Exit focus mode (${formatCombo(binds.escape)})`}
          className="fixed bottom-5 right-5 z-40 rounded-full border border-border glass p-2.5
                     text-secondary hover:text-primary shadow-card transition-colors animate-fade-in"
          onClick={() => setFocusMode(false)}
        >
          <Minimize2 size={15} />
        </button>
      )}
      <CommandPalette />
    </div>
  );
}
