import { KeyboardEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Book,
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
import { StatusChip } from "../components/StatusChip";
import { Button } from "../components/ui/button";
import { pickGreeting } from "../lib/greetings";

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
  const [hello, setHello] = useState(() => pickGreeting());

  useEffect(() => {
    const tick = () => setHello(pickGreeting());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

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
  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="max-w-2xl mx-auto px-7 py-10 animate-rise-in">
      {/* Header — one purpose */}
      <div className="text-center">
        <h1 className="text-xl font-medium">{hello}</h1>
        {firstName ? <p className="text-xl font-semibold text-primary mt-0.5">{firstName}</p> : null}
        <p className="text-sm text-secondary mt-1">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <Button
          variant="accent"
          onClick={() => daily.mutate()}
          disabled={daily.isPending}
          className="mt-4"
        >
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
          <p className="text-sm text-secondary">A notebook is waiting for your first page.</p>
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
            "flex-1 flex flex-col items-center justify-center gap-1.5 px-2 py-3.5 min-w-0",
            "text-secondary transition-colors",
            i > 0 && "border-l border-border/70",
            disabled
              ? "opacity-40 cursor-not-allowed"
              : "hover:text-accent hover:bg-accent-soft/50"
          )}
        >
          <span className="icon-well h-8 w-8 rounded-xl">
            <Icon size={14} strokeWidth={1.75} />
          </span>
          <span className="text-xs font-medium truncate w-full text-center text-primary">{label}</span>
          <kbd className="text-[10px] text-secondary tabular-nums">{formatCombo(binds[bind])}</kbd>
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
    mutationFn: () => createQuickNote({ content: draft.trim() }),
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
    <div className="mt-8 rounded-xl border border-border glass-strong px-3.5 py-3 transition-colors focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
      <div className="flex items-center gap-2">
        <textarea
          className="flex-1 bg-transparent text-sm resize-none focus:outline-none placeholder:text-secondary leading-6 max-h-32 overflow-y-auto"
          rows={1}
          placeholder="What's on your mind?"
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
      <h2 className="section-label mb-3">Continue writing</h2>
      {list.length === 0 && <p className="text-sm text-secondary">Pages you edit will show up here.</p>}
      <ul className="space-y-0.5">
        {list.map((p) => (
          <li key={p.id}>
            <Link
              to={pageRoute(p)}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 -mx-1 text-sm
                         text-secondary hover:text-primary hover:bg-accent-soft/40 transition-colors"
            >
              <span className="icon-well h-7 w-7 rounded-lg shrink-0">
                <FileText size={12} />
              </span>
              <span className="truncate flex-1 text-primary">{p.title}</span>
              {p.section.isLocked && !sectionPasswords[p.section.id] && (
                <Lock size={11} className="shrink-0 text-secondary" />
              )}
              <span className="status-chip status-chip-muted shrink-0">{relativeTime(p.updatedAt)}</span>
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
  const [completing, setCompleting] = useState<Record<string, boolean>>({});

  const toggle = useMutation({
    mutationFn: (id: string) => updateTask(id, { done: true }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const prev = queryClient.getQueryData<Task[]>(["tasks"]);
      queryClient.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, done: true } : t))
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["tasks"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const open = (tasks ?? []).filter((t) => {
    if (completing[t.id]) return true;
    if (t.done) return false;
    if (t.repeatRule && t.dueAt && new Date(t.dueAt) >= endOfToday) return false;
    return true;
  });
  const overdue = open.filter((t) => !completing[t.id] && t.dueAt && new Date(t.dueAt) < startOfToday);
  const dueToday = open.filter(
    (t) =>
      !completing[t.id] &&
      t.dueAt &&
      new Date(t.dueAt) >= startOfToday &&
      new Date(t.dueAt) < endOfToday
  );
  const completingRows = open.filter((t) => completing[t.id]);
  const liveOpen = open.filter((t) => !completing[t.id]);
  const shown: { task: Task; overdue: boolean }[] = [
    ...overdue.map((t) => ({ task: t, overdue: true })),
    ...dueToday.map((t) => ({ task: t, overdue: false })),
  ];
  const list = (
    shown.length > 0
      ? [...shown, ...completingRows.map((t) => ({ task: t, overdue: false as boolean }))]
      : [
          ...liveOpen.slice(0, 5).map((t) => ({ task: t, overdue: false as boolean })),
          ...completingRows.map((t) => ({ task: t, overdue: false as boolean })),
        ]
  ).slice(0, 6);

  function completeTask(id: string) {
    if (completing[id]) return;
    setCompleting((m) => ({ ...m, [id]: true }));
    window.setTimeout(() => {
      toggle.mutate(id, {
        onSettled: () => {
          setCompleting((m) => {
            const next = { ...m };
            delete next[id];
            return next;
          });
        },
      });
    }, 320);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className={clsx("section-label", overdue.length > 0 && "section-label-danger")}>
          {shown.length > 0 ? "Today" : "Tasks"}
        </h2>
        <Link to="/tasks" className="text-xs text-accent hover:underline font-medium">
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
      <ul className="space-y-1">
        {list.map(({ task, overdue: isOverdue }) => {
          const leaving = !!completing[task.id];
          return (
            <li
              key={task.id}
              className={clsx(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 -mx-1 text-sm transition-all duration-300 border border-transparent",
                leaving
                  ? "opacity-0 translate-x-2 pointer-events-none"
                  : isOverdue
                    ? "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] border-[color-mix(in_srgb,var(--danger)_18%,transparent)]"
                    : "hover:bg-accent-soft/40"
              )}
            >
              <button
                className="shrink-0 text-secondary hover:text-accent transition-colors"
                onClick={() => completeTask(task.id)}
                title="Mark done"
                disabled={leaving}
              >
                {leaving ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
              </button>
              <span className={clsx("truncate flex-1 transition-colors", leaving && "line-through text-secondary")}>
                {task.title}
              </span>
              {isOverdue && !leaving && <StatusChip tone="danger">Overdue</StatusChip>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
