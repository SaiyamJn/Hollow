import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Pencil, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createQuickNote, deleteQuickNote, fetchQuickNotes, updateQuickNote } from "../lib/api";
import type { QuickNote } from "../lib/types";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";

const PALETTE: Record<string, string> = {
  gray: "transparent",
  yellow: "rgba(234, 179, 8, 0.14)",
  green: "rgba(93, 202, 165, 0.14)",
  blue: "rgba(96, 165, 250, 0.14)",
  red: "rgba(248, 113, 113, 0.14)",
  purple: "rgba(192, 132, 252, 0.14)",
};

const DOT_COLORS: Record<string, string> = {
  gray: "rgba(128, 128, 128, 0.6)",
  yellow: "rgb(234, 179, 8)",
  green: "rgb(93, 202, 165)",
  blue: "rgb(96, 165, 250)",
  red: "rgb(248, 113, 113)",
  purple: "rgb(192, 132, 252)",
};

function ColorDots({
  value,
  onPick,
  className,
}: {
  value: string;
  onPick: (color: string) => void;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-center gap-1.5", className)}>
      {Object.keys(PALETTE).map((color) => (
        <button
          key={color}
          title={color}
          onClick={() => onPick(color)}
          className={clsx(
            "h-4 w-4 rounded-full border",
            value === color ? "border-accent" : "border-border hover:border-secondary"
          )}
          style={{ background: DOT_COLORS[color] }}
        />
      ))}
    </div>
  );
}

export default function QuickNotes() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("gray");
  const [editing, setEditing] = useState<{ id: string; content: string; color: string } | null>(null);

  const { data: notes } = useQuery({
    queryKey: ["quicknotes", showArchived],
    queryFn: () => fetchQuickNotes(showArchived),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quicknotes"] });

  const create = useMutation({
    mutationFn: () => createQuickNote(draft.trim(), draftColor),
    onSuccess: () => {
      setDraft("");
      setDraftColor("gray");
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateQuickNote>[1] }) =>
      updateQuickNote(id, patch),
    onSuccess: invalidate,
  });
  const saveEdit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { content: string; color: string } }) =>
      updateQuickNote(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: deleteQuickNote, onSuccess: invalidate });

  return (
    <div className="max-w-5xl mx-auto px-7 py-10">
      <div className="text-center mb-6">
        <h1 className="text-xl font-medium">Quick notes</h1>
        <p className="text-sm text-secondary mt-1">Capture thoughts — star the keepers.</p>
        <Button variant="ghost" className="mt-2" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>

      <div
        className="rounded-xl border border-border glass p-5 mb-8 max-w-xl mx-auto shadow-card text-center
                   transition-shadow focus-within:shadow-pop"
        style={{ background: draftColor !== "gray" ? PALETTE[draftColor] : undefined }}
      >
        <textarea
          className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-secondary text-center"
          rows={2}
          placeholder="Take a note…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex flex-col items-center gap-3 mt-3">
          <ColorDots value={draftColor} onPick={setDraftColor} />
          <Button variant="accent" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()}>
            Add note
          </Button>
        </div>
      </div>

      {notes && notes.length === 0 && (
        <p className="text-sm text-secondary text-center">Nothing here yet.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(notes ?? []).map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onPatch={(patch) => update.mutate({ id: note.id, patch })}
            onEdit={() => setEditing({ id: note.id, content: note.content, color: note.color })}
            onDelete={() => remove.mutate(note.id)}
          />
        ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit note" className="max-w-2xl sm:max-w-3xl">
          {editing && (
            <div className="space-y-4">
              <textarea
                autoFocus
                className="w-full rounded-xl border border-border glass-input px-4 py-4 text-sm text-primary leading-relaxed
                           placeholder:text-secondary focus:outline-none focus:border-accent resize-none
                           min-h-[min(56vh,420px)] text-left"
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                style={{ background: editing.color !== "gray" ? PALETTE[editing.color] : undefined }}
              />
              <ColorDots
                value={editing.color}
                onPick={(color) => setEditing({ ...editing, color })}
              />
              <div className="flex gap-2">
                <Button className="flex-1" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={!editing.content.trim() || saveEdit.isPending}
                  onClick={() =>
                    saveEdit.mutate({
                      id: editing.id,
                      patch: { content: editing.content.trim(), color: editing.color },
                    })
                  }
                >
                  {saveEdit.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteCard({
  note,
  onPatch,
  onEdit,
  onDelete,
}: {
  note: QuickNote;
  onPatch: (patch: Partial<Pick<QuickNote, "content" | "color" | "pinned" | "archived">>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group rounded-xl border border-border glass p-5 shadow-card
                 transition-all duration-200 hover:shadow-pop hover:-translate-y-0.5
                 flex flex-col items-center text-center min-h-[140px]"
      style={{ background: note.color !== "gray" ? PALETTE[note.color] : undefined }}
    >
      <button type="button" onClick={onEdit} className="w-full flex-1">
        <p className="text-sm whitespace-pre-wrap text-primary">{note.content}</p>
      </button>
      <div className="flex items-center justify-center gap-3 mt-4 text-secondary">
        <button
          title={note.pinned ? "Unstar" : "Star"}
          className={clsx(note.pinned ? "text-accent" : "hover:text-primary")}
          onClick={() => onPatch({ pinned: !note.pinned })}
        >
          <Star size={14} fill={note.pinned ? "currentColor" : "none"} />
        </button>
        <button title="Edit" className="hover:text-primary" onClick={onEdit}>
          <Pencil size={14} />
        </button>
        <button
          title={note.archived ? "Unarchive" : "Archive"}
          className="hover:text-primary"
          onClick={() => onPatch({ archived: !note.archived })}
        >
          {note.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>
        <button title="Delete" className="hover:text-primary" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
