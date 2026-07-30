import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Book,
  CalendarDays,
  CheckSquare,
  FileText,
  Home,
  Lock,
  Maximize2,
  Moon,
  Search,
  Settings,
  StickyNote,
  Sun,
  Waypoints,
} from "lucide-react";
import clsx from "clsx";
import { fetchNotebooks, openDailyNote } from "../lib/api";
import { formatCombo, useKeybindsStore } from "../lib/keybinds";
import { useUiStore } from "../stores/ui";
import { useUnlockStore } from "../stores/unlock";
import { useTheme } from "../theme/ThemeProvider";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  locked?: boolean;
  run: () => void;
}

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const focusMode = useUiStore((s) => s.focusMode);
  const activeNotebookId = useUiStore((s) => s.activeNotebookId);
  const sectionPasswords = useUnlockStore((s) => s.sectionPasswords);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { theme, toggle: toggleTheme } = useTheme();
  const binds = useKeybindsStore((s) => s.binds);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks, enabled: open });

  const daily = useMutation({
    mutationFn: openDailyNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      navigate(`/notebooks/${note.notebookId}/sections/${note.sectionId}/pages/${note.id}`);
    },
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      // Wait for the panel to mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const onEditorPage = /\/pages\//.test(location.pathname);
  const graphNotebookId = activeNotebookId ?? notebooks?.[0]?.id;

  const items = useMemo<PaletteItem[]>(() => {
    const close = () => setOpen(false);
    const actions: PaletteItem[] = [
      {
        id: "daily",
        label: "Open today's daily note",
        hint: formatCombo(binds.daily),
        icon: <CalendarDays size={15} />,
        keywords: "journal today diary",
        run: () => {
          close();
          daily.mutate();
        },
      },
      {
        id: "quick-note",
        label: "New quick note",
        hint: formatCombo(binds.quickNotes),
        icon: <StickyNote size={15} />,
        keywords: "capture sticky keep",
        run: () => {
          close();
          navigate("/quick-notes");
        },
      },
      {
        id: "home",
        label: "Go home",
        hint: formatCombo(binds.home),
        icon: <Home size={15} />,
        keywords: "dashboard start",
        run: () => {
          close();
          navigate("/");
        },
      },
      {
        id: "notebooks",
        label: "Go to notebooks",
        icon: <Book size={15} />,
        keywords: "shelf library",
        run: () => {
          close();
          navigate("/notebooks");
        },
      },
      {
        id: "tasks",
        label: "Go to tasks",
        hint: formatCombo(binds.tasks),
        icon: <CheckSquare size={15} />,
        keywords: "todo",
        run: () => {
          close();
          navigate("/tasks");
        },
      },
      {
        id: "quick-notes",
        label: "Go to quick notes",
        hint: formatCombo(binds.quickNotes),
        icon: <StickyNote size={15} />,
        keywords: "sticky",
        run: () => {
          close();
          navigate("/quick-notes");
        },
      },
      ...(graphNotebookId
        ? [
            {
              id: "graph",
              label: "Open graph view",
              hint: formatCombo(binds.graph),
              icon: <Waypoints size={15} />,
              keywords: "links network map",
              run: () => {
                close();
                navigate(`/notebooks/${graphNotebookId}/graph`);
              },
            } satisfies PaletteItem,
          ]
        : []),
      {
        id: "settings",
        label: "Open settings",
        hint: formatCombo(binds.settings),
        icon: <Settings size={15} />,
        run: () => {
          close();
          navigate("/settings");
        },
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        hint: formatCombo(binds.theme),
        icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />,
        keywords: "dark light mode appearance",
        run: () => {
          close();
          toggleTheme();
        },
      },
      ...(onEditorPage
        ? [
            {
              id: "focus",
              label: focusMode ? "Exit focus mode" : "Enter focus mode",
              hint: formatCombo(binds.focus),
              icon: <Maximize2 size={15} />,
              keywords: "zen write distraction",
              run: () => {
                close();
                setFocusMode(!focusMode);
              },
            } satisfies PaletteItem,
          ]
        : []),
    ];

    const pages: PaletteItem[] = (notebooks ?? []).flatMap((nb) =>
      nb.sections.flatMap((sec) =>
        sec.pages.map((p) => ({
          id: `page-${p.id}`,
          label: p.title,
          hint: `${nb.title} / ${sec.title}`,
          icon: <FileText size={15} />,
          locked: sec.isLocked && !sectionPasswords[sec.id],
          run: () => {
            setOpen(false);
            navigate(`/notebooks/${sec.notebookId}/sections/${sec.id}/pages/${p.id}`);
          },
        }))
      )
    );

    const notebookItems: PaletteItem[] = (notebooks ?? []).map((nb) => ({
      id: `nb-graph-${nb.id}`,
      label: `Graph: ${nb.title}`,
      icon: <Book size={15} />,
      keywords: "notebook graph",
      run: () => {
        setOpen(false);
        navigate(`/notebooks/${nb.id}/graph`);
      },
    }));

    return [...actions, ...pages, ...notebookItems];
  }, [notebooks, theme, focusMode, onEditorPage, graphNotebookId, sectionPasswords, binds]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter((item) => `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [items, query]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[selected]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        className="absolute left-1/2 top-[16%] w-full max-w-lg -translate-x-1/2 rounded-2xl border border-border
                   glass shadow-pop overflow-hidden animate-palette-in"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-3.5 border-b border-border">
          <Search size={15} className="text-secondary shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent py-3 text-sm focus:outline-none placeholder:text-secondary"
            placeholder="Search pages, or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="text-[10px] text-secondary border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-secondary">No matches.</p>}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={clsx(
                "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                i === selected ? "bg-accent-soft text-primary" : "text-secondary hover:bg-surface-2"
              )}
              onMouseEnter={() => setSelected(i)}
              onClick={item.run}
            >
              <span className={clsx("shrink-0", i === selected ? "text-accent" : "")}>{item.icon}</span>
              <span className="truncate flex-1 text-primary">{item.label}</span>
              {item.locked && <Lock size={12} className="shrink-0 text-secondary" />}
              {item.hint && <span className="text-xs text-secondary shrink-0 truncate max-w-[40%]">{item.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
