import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createQuickNote, deleteQuickNote, fetchQuickNotes, updateQuickNote } from "../lib/api";
import type { QuickNote } from "../lib/types";
import { Button } from "../components/ui/button";

// Fixed small palette; alpha tints work on both light and dark surfaces.
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

function ColorDots({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
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
  const remove = useMutation({ mutationFn: deleteQuickNote, onSuccess: invalidate });

  return (
    <div className="max-w-5xl mx-auto px-7 py-10">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-medium">Quick notes</h1>
        <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>

      {/* composer */}
      <div
        className="rounded-xl border border-border glass p-4 mb-6 max-w-xl shadow-card
                   transition-shadow focus-within:shadow-pop"
        style={{ background: draftColor !== "gray" ? PALETTE[draftColor] : undefined }}
      >
        <textarea
          className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-secondary"
          rows={2}
          placeholder="Take a note…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2">
          <ColorDots value={draftColor} onPick={setDraftColor} />
          <Button variant="accent" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()}>
            Add
          </Button>
        </div>
      </div>

      {/* masonry grid */}
      {notes && notes.length === 0 && <p className="text-sm text-secondary">Nothing here yet.</p>}
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 [&>*]:mb-4">
        {(notes ?? []).map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onPatch={(patch) => update.mutate({ id: note.id, patch })}
            onDelete={() => remove.mutate(note.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NoteCard({
  note,
  onPatch,
  onDelete,
}: {
  note: QuickNote;
  onPatch: (patch: Partial<Pick<QuickNote, "content" | "color" | "pinned" | "archived">>) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group break-inside-avoid rounded-xl border border-border glass p-4 shadow-card
                 transition-all duration-200 hover:shadow-pop hover:-translate-y-0.5"
      style={{ background: note.color !== "gray" ? PALETTE[note.color] : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm whitespace-pre-wrap flex-1">{note.content}</p>
        <button
          title={note.pinned ? "Unstar" : "Star"}
          className={clsx(
            "shrink-0",
            note.pinned ? "text-accent" : "text-secondary opacity-0 group-hover:opacity-100 hover:text-primary"
          )}
          onClick={() => onPatch({ pinned: !note.pinned })}
        >
          <Star size={14} fill={note.pinned ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <ColorDots value={note.color} onPick={(color) => onPatch({ color })} />
        <div className="flex items-center gap-2 text-secondary">
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
    </div>
  );
}
