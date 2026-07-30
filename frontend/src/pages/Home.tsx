import { KeyboardEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Book,
  BookOpenText,
  CalendarDays,
  CheckSquare,
  FileText,
  Lock,
  NotebookPen,
  Send,
  Square,
  StickyNote,
  Waypoints,
} from "lucide-react";
import clsx from "clsx";
import {
  createQuickNote,
  fetchNotebooks,
  fetchRecentPages,
  fetchTasks,
  openDailyNote,
  updateTask,
} from "../lib/api";
import type { RecentPage, Task } from "../lib/types";
import { useAuthStore } from "../stores/auth";
import { useUnlockStore } from "../stores/unlock";
import { useUiStore } from "../stores/ui";
import { formatCombo, useKeybindsStore, type KeybindId } from "../lib/keybinds";
import { Button } from "../components/ui/button";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pageRoute(p: RecentPage) {
  return `/notebooks/${p.section.notebookId}/sections/${p.section.id}/pages/${p.id}`;
}

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recent } = useQuery({ queryKey: ["recent-pages"], queryFn: () => fetchRecentPages(6) });
  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });

  const daily = useMutation({
    mutationFn: openDailyNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      navigate(`/notebooks/${note.notebookId}/sections/${note.sectionId}/pages/${note.id}`);
    },
  });

  const empty = notebooks && notebooks.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-7 py-10 animate-rise-in">
      {/* Header — one purpose */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-medium truncate">
            {greeting()}
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-secondary mt-1">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button variant="accent" onClick={() => daily.mutate()} disabled={daily.isPending} className="shrink-0">
          <CalendarDays size={14} />
          Today's note
        </Button>
      </div>
      {daily.isError && (
        <p className="mt-2 text-xs text-danger">
          {(daily.error as any)?.response?.data?.error ?? "Couldn't open today's note."}
        </p>
      )}

      <QuickCapture />

      <HomeShortcuts notebooks={notebooks} />

      {empty ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border glass py-14">
          <div className="h-11 w-11 rounded-2xl bg-accent-soft flex items-center justify-center">
            <NotebookPen size={18} className="text-accent" />
          </div>
          <p className="text-sm text-secondary">Create a notebook to get started.</p>
          <Button variant="accent" onClick={() => navigate("/notebooks")}>
            Open notebooks
          </Button>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-10">
          <RecentPages recent={recent} />
          <TodayTasks />
        </div>
      )}
    </div>
  );
}

function HomeShortcuts({ notebooks }: { notebooks?: { id: string }[] }) {
  const navigate = useNavigate();
  const binds = useKeybindsStore((s) => s.binds);
  const activeNotebookId = useUiStore((s) => s.activeNotebookId);
  const graphId = activeNotebookId ?? notebooks?.[0]?.id;

  const shortcuts: {
    label: string;
    icon: typeof Book;
    bind: KeybindId;
    onClick: () => void;
    disabled?: boolean;
  }[] = [
    { label: "Notebooks", icon: Book, bind: "notebooks", onClick: () => navigate("/notebooks") },
    { label: "Notes", icon: StickyNote, bind: "quickNotes", onClick: () => navigate("/quick-notes") },
    { label: "Tasks", icon: CheckSquare, bind: "tasks", onClick: () => navigate("/tasks") },
    {
      label: "Links",
      icon: Waypoints,
      bind: "graph",
      onClick: () => graphId && navigate(`/notebooks/${graphId}/graph`),
      disabled: !graphId,
    },
  ];

  return (
    <div className="mt-4 flex items-stretch rounded-xl border border-border glass overflow-hidden">
      {shortcuts.map(({ label, icon: Icon, bind, onClick, disabled }, i) => (
        <button
          key={label}
          type="button"
          title={`${label} (${formatCombo(binds[bind])})`}
          disabled={disabled}
          onClick={onClick}
          className={clsx(
            "flex-1 flex flex-col items-center justify-center gap-1 px-2 py-3 min-w-0",
            "text-secondary transition-colors",
            i > 0 && "border-l border-border",
            disabled
              ? "opacity-40 cursor-not-allowed"
              : "hover:text-primary hover:bg-surface-2/40"
          )}
        >
          <Icon size={15} strokeWidth={1.75} className="shrink-0" />
          <span className="text-xs font-medium truncate w-full text-center">{label}</span>
          <kbd className="text-xs text-secondary tabular-nums">{formatCombo(binds[bind])}</kbd>
        </button>
      ))}
    </div>
  );
}

function QuickCapture() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [captured, setCaptured] = useState(false);

  const capture = useMutation({
    mutationFn: () => createQuickNote(draft.trim()),
    onSuccess: () => {
      setDraft("");
      setCaptured(true);
      window.setTimeout(() => setCaptured(false), 1800);
      queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
    },
  });

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() && !capture.isPending) capture.mutate();
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-border glass px-3.5 py-3 transition-colors focus-within:border-accent">
      <div className="flex items-center gap-2">
        <textarea
          className="flex-1 bg-transparent text-sm resize-none focus:outline-none placeholder:text-secondary leading-6"
          rows={1}
          placeholder="Capture a thought…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          title="Save to quick notes"
          className={clsx(
            "shrink-0 rounded-md p-1.5 transition-colors",
            draft.trim() ? "text-accent hover:bg-accent-soft" : "text-secondary"
          )}
          disabled={!draft.trim() || capture.isPending}
          onClick={() => capture.mutate()}
        >
          <Send size={15} />
        </button>
      </div>
      {captured && <p className="mt-1.5 text-xs text-accent animate-fade-in">Saved to quick notes.</p>}
    </div>
  );
}

function RecentPages({ recent }: { recent?: RecentPage[] }) {
  const sectionPasswords = useUnlockStore((s) => s.sectionPasswords);
  const list = (recent ?? []).slice(0, 5);

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide text-secondary mb-3 flex items-center gap-1.5">
        <BookOpenText size={13} /> Continue writing
      </h2>
      {list.length === 0 && <p className="text-sm text-secondary">Pages you edit will show up here.</p>}
      <ul className="space-y-0.5">
        {list.map((p) => (
          <li key={p.id}>
            <Link
              to={pageRoute(p)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 -mx-2 text-sm
                         text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
            >
              <FileText size={13} className="shrink-0 opacity-70" />
              <span className="truncate flex-1 text-primary">{p.title}</span>
              {p.section.isLocked && !sectionPasswords[p.section.id] && (
                <Lock size={11} className="shrink-0" />
              )}
              <span className="text-xs shrink-0 tabular-nums">{relativeTime(p.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodayTasks() {
  const queryClient = useQueryClient();
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => updateTask(id, { done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const open = (tasks ?? []).filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < startOfToday);
  const dueToday = open.filter(
    (t) => t.dueAt && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) < endOfToday
  );
  const shown: { task: Task; overdue: boolean }[] = [
    ...overdue.map((t) => ({ task: t, overdue: true })),
    ...dueToday.map((t) => ({ task: t, overdue: false })),
  ];
  const list = (shown.length > 0 ? shown : open.slice(0, 5).map((t) => ({ task: t, overdue: false }))).slice(0, 5);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wide text-secondary flex items-center gap-1.5">
          <CheckSquare size={13} /> {shown.length > 0 ? "Today" : "Tasks"}
        </h2>
        <Link to="/tasks" className="text-xs text-secondary hover:text-accent">
          All
        </Link>
      </div>
      {list.length === 0 && (
        <p className="text-sm text-secondary">
          Nothing due.{" "}
          <Link to="/tasks" className="text-accent hover:underline">
            Add one
          </Link>
        </p>
      )}
      <ul className="space-y-0.5">
        {list.map(({ task, overdue: isOverdue }) => (
          <li
            key={task.id}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 -mx-2 text-sm hover:bg-surface-2 transition-colors"
          >
            <button
              className="shrink-0 text-secondary hover:text-accent transition-colors"
              onClick={() => toggle.mutate({ id: task.id, done: true })}
              title="Mark done"
            >
              <Square size={14} />
            </button>
            <span className="truncate flex-1">{task.title}</span>
            {isOverdue && <span className="text-xs text-danger shrink-0">overdue</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
