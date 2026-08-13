import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { deleteQuickNotePermanent, fetchQuickNotes, restoreQuickNote } from "../lib/api";
import type { QuickNote } from "../lib/types";
import { Button } from "../components/ui/button";
import { Link } from "react-router-dom";

function daysLeft(deletedAt?: string | null) {
  if (!deletedAt) return 7;
  const ms = new Date(deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function RecycleBin() {
  const queryClient = useQueryClient();
  const { data: notes, isLoading } = useQuery({
    queryKey: ["quicknotes", "trash"],
    queryFn: () => fetchQuickNotes(false, true),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  };

  const restore = useMutation({
    mutationFn: restoreQuickNote,
    onSuccess: invalidate,
  });
  const purge = useMutation({
    mutationFn: deleteQuickNotePermanent,
    onSuccess: invalidate,
  });
  const emptyAll = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteQuickNotePermanent(id)));
    },
    onSuccess: invalidate,
  });

  const list = notes ?? [];

  return (
    <div className="max-w-2xl mx-auto px-7 py-10 space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-medium">Recycle bin</h1>
        <p className="text-sm text-secondary mt-1">Notes stay here for 7 days, then they’re gone for good.</p>
        <Link to="/quick-notes" className="inline-block mt-2 text-sm text-accent hover:underline">
          ← Back to notes
        </Link>
      </div>

      {list.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            disabled={emptyAll.isPending}
            onClick={() => {
              if (window.confirm(`Permanently delete ${list.length} note${list.length === 1 ? "" : "s"}?`)) {
                emptyAll.mutate(list.map((n) => n.id));
              }
            }}
          >
            Empty bin
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-secondary text-center py-8">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Recycle bin is empty.</p>
      ) : (
        <ul className="rounded-xl border border-border glass shadow-card divide-y divide-[var(--border)]">
          {list.map((note) => (
            <TrashRow
              key={note.id}
              note={note}
              busy={restore.isPending || purge.isPending}
              onRestore={() => restore.mutate(note.id)}
              onPurge={() => {
                if (window.confirm("Delete forever?")) purge.mutate(note.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TrashRow({
  note,
  busy,
  onRestore,
  onPurge,
}: {
  note: QuickNote;
  busy: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const title = note.title?.trim() || (note.kind === "list" ? "List" : "Note");
  const preview =
    note.kind === "list"
      ? `${(note.items ?? []).filter((i) => i.text.trim()).length} items`
      : note.content.trim().slice(0, 80) || "Empty";
  const left = daysLeft(note.deletedAt);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary truncate">{title}</p>
        <p className="text-xs text-secondary truncate mt-0.5">
          {preview} · {left}d left
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        title="Restore"
        onClick={onRestore}
        className="p-1.5 rounded-md text-secondary hover:text-accent disabled:opacity-50"
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        disabled={busy}
        title="Delete forever"
        onClick={onPurge}
        className="p-1.5 rounded-md text-secondary hover:text-danger disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}
