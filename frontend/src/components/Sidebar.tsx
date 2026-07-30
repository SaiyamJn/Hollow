import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Book, CheckSquare, Home, StickyNote, Waypoints } from "lucide-react";
import clsx from "clsx";
import { fetchNotebooks } from "../lib/api";
import { useUiStore } from "../stores/ui";

const items = [
  { key: "home", to: "/", label: "Home", icon: Home, end: true },
  { key: "notebooks", to: "/notebooks", label: "Notebooks", icon: Book },
  { key: "quick", to: "/quick-notes", label: "Quick notes", icon: StickyNote },
  { key: "tasks", to: "/tasks", label: "Tasks", icon: CheckSquare },
] as const;

// Floating glass pill — same idea as the mobile tab bar, centered at the bottom.
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
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
                 h-[52px] px-2 rounded-full border border-border/80 glass shadow-pop
                 animate-rise-in"
      aria-label="Main"
    >
      {items.map(({ key, to, label, icon: Icon, ...rest }) => {
        const end = "end" in rest && rest.end;
        return (
          <NavLink
            key={key}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) => {
              const active = key === "notebooks" ? onNotebooks : isActive;
              return clsx(
                "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150",
                active
                  ? "bg-accent text-surface-0 shadow-[0_0_16px_var(--accent-soft)]"
                  : "text-secondary hover:text-primary hover:bg-surface-2/80"
              );
            }}
          >
            <Icon size={17} strokeWidth={1.75} />
          </NavLink>
        );
      })}

      <button
        type="button"
        title="Graph"
        disabled={!graphNotebookId}
        onClick={() => graphNotebookId && navigate(`/notebooks/${graphNotebookId}/graph`)}
        className={clsx(
          "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150",
          "disabled:opacity-40 disabled:pointer-events-none",
          onGraph
            ? "bg-accent text-surface-0 shadow-[0_0_16px_var(--accent-soft)]"
            : "text-secondary hover:text-primary hover:bg-surface-2/80"
        )}
      >
        <Waypoints size={17} strokeWidth={1.75} />
      </button>
    </nav>
  );
}
