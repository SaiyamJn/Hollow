import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Book,
  CheckSquare,
  FileText,
  Layers,
  Link2,
  LogOut,
  Search,
  Shield,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { deleteAdminUser, fetchAdminStats } from "../lib/api";
import type { AdminUserStats } from "../lib/types";
import { prefers12HourClock } from "../lib/timeFormat";
import { useAdminStore } from "../stores/admin";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: prefers12HourClock(),
  });
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAdminStore((s) => s.token);
  const adminEmail = useAdminStore((s) => s.email);
  const logout = useAdminStore((s) => s.logout);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
    enabled: !!token,
    retry: false,
  });

  const removeUser = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: (_void, id) => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setConfirmDelete(false);
      setSelectedId((cur) => (cur === id ? null : cur));
    },
  });

  const filtered = useMemo(() => {
    if (!data?.users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        u.id.includes(q)
    );
  }, [data, query]);

  const selected = filtered.find((u) => u.id === selectedId) ?? filtered[0] ?? null;

  if (!token) return <Navigate to="/admin/login" replace />;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0 text-sm text-secondary">
        Loading…
      </div>
    );
  }

  if (error || !data) {
    const message = (error as any)?.response?.data?.error;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-surface-0 px-6">
        <Shield size={20} className="text-secondary" />
        <p className="text-sm text-secondary text-center">{message ?? "Couldn't load admin data."}</p>
        {message === "Admin access is not configured" && (
          <p className="text-xs text-secondary max-w-md text-center">
            Set <code className="text-accent">ADMIN_EMAIL</code> and{" "}
            <code className="text-accent">ADMIN_PASSWORD</code> (min 8 chars) in the server{" "}
            <code className="text-accent">.env</code>, then restart.
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <Button
            onClick={() => {
              logout();
              navigate("/admin/login");
            }}
          >
            Sign in again
          </Button>
          <Button onClick={() => navigate("/login")}>User login</Button>
        </div>
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
    <div className="min-h-screen bg-surface-0 text-primary">
      <header className="h-12 border-b border-border glass-strong flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark size="sm" />
          <span className="text-sm font-medium">Hollow Admin</span>
          {adminEmail && <span className="text-xs text-secondary hidden sm:inline">· {adminEmail}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="text-xs text-secondary hover:text-primary px-2">
            App
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              logout();
              navigate("/admin/login");
            }}
            title="Log out of admin"
          >
            <LogOut size={15} />
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-7 py-8 animate-rise-in space-y-6">
        <div>
          <h1 className="text-xl font-medium">Registered users</h1>
          <p className="text-sm text-secondary mt-1">
            Account details and usage. Note contents are never shown — locked data stays encrypted.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-border glass p-3 flex flex-col items-center justify-center text-center gap-1.5 min-h-[76px]"
            >
              <div className="flex items-center justify-center gap-1.5 text-secondary text-xs">
                {c.icon}
                <span>{c.label}</span>
              </div>
              <p className="text-xl font-medium text-primary tabular-nums">{c.value}</p>
            </div>
          ))}
        </div>

        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <Input
            className="pl-9"
            placeholder="Search by name, username, email, or id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-secondary border-b border-border glass">
                  <th className="text-left font-medium px-4 py-2.5">User</th>
                  <th className="text-right font-medium px-3 py-2.5">Notebooks</th>
                  <th className="text-right font-medium px-3 py-2.5">Pages</th>
                  <th className="text-right font-medium px-3 py-2.5">Notes</th>
                  <th className="text-right font-medium px-3 py-2.5">Tasks</th>
                  <th className="text-right font-medium px-3 py-2.5">Storage</th>
                  <th className="text-right font-medium px-4 py-2.5">Last active</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u: AdminUserStats) => {
                  const active = selected?.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedId(u.id)}
                      className={`border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                        active ? "bg-accent-soft" : "hover:glass"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-secondary">
                          @{u.username} · {u.email}
                        </p>
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{u.notebooks}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{u.pages}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{u.quickNotes}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">
                        {u.tasksDone}/{u.tasks}
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{formatBytes(u.contentBytes)}</td>
                      <td className="text-right px-4 py-2.5 text-secondary">{relativeTime(u.lastActive)}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-secondary text-sm">
                      {data.users.length === 0 ? "No users registered yet." : "No users match that search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <aside className="rounded-xl border border-border glass p-5 space-y-3 lg:sticky lg:top-16">
            <h2 className="text-sm font-medium">User details</h2>
            {selected ? (
              <>
                <dl className="space-y-2.5 text-sm">
                  <Detail label="Name" value={selected.name} />
                  <Detail label="Username" value={`@${selected.username}`} />
                  <Detail label="Email" value={selected.email} />
                  <Detail label="User ID" value={selected.id} mono />
                  <Detail label="Joined" value={formatDateTime(selected.joinedAt)} />
                  <Detail label="Last active" value={formatDateTime(selected.lastActive)} />
                  <Detail label="Notebooks" value={String(selected.notebooks)} />
                  <Detail
                    label="Sections"
                    value={`${selected.sections}${
                      selected.lockedSections ? ` (${selected.lockedSections} locked)` : ""
                    }`}
                  />
                  <Detail label="Pages" value={String(selected.pages)} />
                  <Detail label="Quick notes" value={String(selected.quickNotes)} />
                  <Detail label="Tasks" value={`${selected.tasksDone} done / ${selected.tasks} total`} />
                  <Detail label="Approx. storage" value={formatBytes(selected.contentBytes)} />
                </dl>
                <Button
                  className="w-full mt-2"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete this user and all their data"
                >
                  <span className="inline-flex items-center gap-1.5 text-danger">
                    <Trash2 size={14} /> Remove user
                  </span>
                </Button>
                {removeUser.error && (
                  <p className="text-xs text-danger text-center">
                    {(removeUser.error as any)?.response?.data?.error ?? "Couldn't delete user."}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-secondary">Select a user from the table.</p>
            )}
          </aside>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title="Remove user">
          <div className="space-y-3 text-center">
            <p className="text-sm text-secondary">
              Permanently delete <span className="text-primary">{selected?.name}</span>
              {selected?.username ? ` (@${selected.username})` : ""} and all notebooks, pages, notes,
              and tasks? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!selected || removeUser.isPending}
                onClick={() => selected && removeUser.mutate(selected.id)}
              >
                <span className="text-danger">
                  {removeUser.isPending ? "Removing…" : "Remove user"}
                </span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className={`text-primary break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
