import { useQuery } from "@tanstack/react-query";
import { Book, FileText, Layers, Link2, ShieldOff, StickyNote, CheckSquare, Users } from "lucide-react";
import { fetchAdminStats } from "../lib/api";
import type { AdminUserStats } from "../lib/types";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function relativeTime(iso: string | null) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default function AdminDashboard() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
    retry: false,
  });

  if (isLoading) return <div className="p-7 text-sm text-secondary">Loading…</div>;

  if (error || !data) {
    const message = (error as any)?.response?.data?.error;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 animate-rise-in">
        <ShieldOff size={20} className="text-secondary" />
        <p className="text-sm text-secondary">{message ?? "Couldn't load admin stats."}</p>
        {message === "Admin access is not configured" && (
          <p className="text-xs text-secondary max-w-sm text-center">
            Set <code className="text-accent">ADMIN_EMAILS=your@email.com</code> in the backend .env and restart
            the server.
          </p>
        )}
      </div>
    );
  }

  const totals = data.totals;
  const cards = [
    { label: "Users", value: totals.users, icon: <Users size={15} /> },
    { label: "Notebooks", value: totals.notebooks, icon: <Book size={15} /> },
    { label: "Sections", value: totals.sections, icon: <Layers size={15} /> },
    { label: "Pages", value: totals.pages, icon: <FileText size={15} /> },
    { label: "Quick notes", value: totals.quickNotes, icon: <StickyNote size={15} /> },
    { label: "Tasks", value: totals.tasks, icon: <CheckSquare size={15} /> },
    { label: "Wiki links", value: totals.links, icon: <Link2 size={15} /> },
  ];

  return (
    <div className="max-w-5xl mx-auto px-7 py-8 animate-rise-in">
      <h1 className="text-lg font-medium">Admin</h1>
      <p className="text-sm text-secondary mt-1">
        Usage stats per account. Content is never shown here — locked sections stay encrypted on the server.
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface-1 p-3">
            <div className="flex items-center gap-1.5 text-secondary text-xs">
              {c.icon} {c.label}
            </div>
            <p className="text-xl font-medium mt-1.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-secondary border-b border-border bg-surface-1">
              <th className="text-left font-medium px-4 py-2.5">User</th>
              <th className="text-right font-medium px-3 py-2.5">Notebooks</th>
              <th className="text-right font-medium px-3 py-2.5">Sections</th>
              <th className="text-right font-medium px-3 py-2.5">Pages</th>
              <th className="text-right font-medium px-3 py-2.5">Quick notes</th>
              <th className="text-right font-medium px-3 py-2.5">Tasks</th>
              <th className="text-right font-medium px-3 py-2.5">Storage</th>
              <th className="text-right font-medium px-3 py-2.5">Joined</th>
              <th className="text-right font-medium px-4 py-2.5">Last active</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u: AdminUserStats) => (
              <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-surface-1 transition-colors">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-secondary">{u.email}</p>
                </td>
                <td className="text-right px-3 py-2.5">{u.notebooks}</td>
                <td className="text-right px-3 py-2.5">
                  {u.sections}
                  {u.lockedSections > 0 && (
                    <span className="text-xs text-secondary"> ({u.lockedSections} locked)</span>
                  )}
                </td>
                <td className="text-right px-3 py-2.5">{u.pages}</td>
                <td className="text-right px-3 py-2.5">{u.quickNotes}</td>
                <td className="text-right px-3 py-2.5">
                  {u.tasksDone}/{u.tasks}
                </td>
                <td className="text-right px-3 py-2.5">{formatBytes(u.contentBytes)}</td>
                <td className="text-right px-3 py-2.5 text-secondary">{formatDate(u.joinedAt)}</td>
                <td className="text-right px-4 py-2.5 text-secondary">{relativeTime(u.lastActive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
