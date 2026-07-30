import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Book, CheckSquare, Home, StickyNote, Waypoints } from "lucide-react";
import clsx from "clsx";
import { fetchNotebooks } from "../lib/api";
import { useUiStore } from "../stores/ui";
import { formatCombo, useKeybindsStore, type KeybindId } from "../lib/keybinds";

const items: {
  key: string;
  to: string;
  label: string;
  icon: typeof Home;
  bind: KeybindId;
  end?: boolean;
}[] = [
  { key: "home", to: "/", label: "Home", icon: Home, bind: "home", end: true },
  { key: "notebooks", to: "/notebooks", label: "Notebooks", icon: Book, bind: "notebooks" },
  { key: "quick", to: "/quick-notes", label: "Quick notes", icon: StickyNote, bind: "quickNotes" },
  { key: "tasks", to: "/tasks", label: "Tasks", icon: CheckSquare, bind: "tasks" },
];

// Floating glass pill — same idea as the mobile tab bar, centered at the bottom.
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const binds = useKeybindsStore((s) => s.binds);
  const activeNotebookId = useUiStore((s) => s.activeNotebookId);
  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const graphNotebookId = activeNotebookId ?? notebooks?.[0]?.id;
  const onGraph = location.pathname.endsWith("/graph");
  const onNotebooks =
    location.pathname === "/notebooks" ||
    (location.pathname.startsWith("/notebooks/") && !onGraph) ||
    /\/pages\//.test(location.pathname);

  return (
    <nav
      className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-1
                 h-[52px] px-2 rounded-full border border-black/[0.06] dark:border-white/[0.08]
                 glass-strong shadow-[0_6px_28px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)]
                 animate-rise-in"
      aria-label="Main"
    >
      {items.map(({ key, to, label, icon: Icon, bind, end }) => (
        <NavLink
          key={key}
          to={to}
          end={end}
          title={`${label} (${formatCombo(binds[bind])})`}
          className={({ isActive }) => {
            const active = key === "notebooks" ? onNotebooks : isActive;
            return clsx(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150",
              active
                ? "bg-accent text-surface-0"
                : "text-secondary hover:text-primary hover:bg-surface-2/80"
            );
          }}
        >
          <Icon size={17} strokeWidth={1.75} />
        </NavLink>
      ))}

      <button
        type="button"
        title={`Links (${formatCombo(binds.graph)})`}
        disabled={!graphNotebookId}
        onClick={() => graphNotebookId && navigate(`/notebooks/${graphNotebookId}/graph`)}
        className={clsx(
          "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150",
          "disabled:opacity-40 disabled:pointer-events-none",
          onGraph
            ? "bg-accent text-surface-0"
            : "text-secondary hover:text-primary hover:bg-surface-2/80"
        )}
      >
        <Waypoints size={17} strokeWidth={1.75} />
      </button>
    </nav>
  );
}
