import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  ListTodo,
  Square,
  Star,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  createQuickNote,
  deleteQuickNote,
  deleteQuickNotePermanent,
  fetchQuickNotes,
  reorderQuickNotes,
  updateQuickNote,
} from "../lib/api";
import type { ChecklistItem, QuickNote } from "../lib/types";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { SortableNotesSection } from "../components/SortableNotesSection";
import { EmptyState } from "../components/EmptyState";
import { shouldHandleItemDelete } from "../lib/keys";

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

function newItemId() {
  return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ColorDots({
  value,
  onPick,
}: {
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Object.keys(PALETTE).map((color) => (
        <button
          key={color}
          type="button"
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

type EditState = {
  id: string;
  title: string;
  content: string;
  color: string;
  kind: "note" | "list";
  items: ChecklistItem[];
  isNew?: boolean;
};

function isEmptyEdit(e: EditState) {
  if (e.kind === "list") {
    return !e.title.trim() && !e.items.some((i) => i.text.trim());
  }
  return !e.title.trim() && !e.content.trim();
}

export default function QuickNotes() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("yellow");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [hoverNoteId, setHoverNoteId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!shouldHandleItemDelete(e)) return;
      if (selected.size > 0) {
        e.preventDefault();
        setConfirmTrash(true);
        return;
      }
      if (hoverNoteId) {
        e.preventDefault();
        setSelected(new Set([hoverNoteId]));
        setConfirmTrash(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, hoverNoteId]);

  const { data: library } = useQuery({
    queryKey: ["quicknotes", "library"],
    queryFn: () => fetchQuickNotes(true),
  });

  const notes = useMemo(() => {
    const all = library ?? [];
    return all.filter((n) => (showArchived ? n.archived : !n.archived));
  }, [library, showArchived]);

  const archivedCount = useMemo(
    () => (library ?? []).filter((n) => n.archived).length,
    [library]
  );

  const selecting = selected.size > 0;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  const editSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSaveSeq = useRef(0);

  async function persistOrder(group: QuickNote[], orderedIds: string[]) {
    const pinnedIds = notes.filter((n) => n.pinned).map((n) => n.id);
    const restIds = notes.filter((n) => !n.pinned).map((n) => n.id);
    const isPinnedGroup = group.length > 0 && group.every((n) => n.pinned);
    const merged = isPinnedGroup ? [...orderedIds, ...restIds] : [...pinnedIds, ...orderedIds];

    queryClient.setQueryData<QuickNote[]>(["quicknotes", "library"], (prev) => {
      if (!prev) return prev;
      const base = Math.floor(Date.now() / 1000);
      const rank = new Map(merged.map((id, i) => [id, base - i]));
      return [...prev]
        .map((n) => (rank.has(n.id) ? { ...n, sortOrder: rank.get(n.id)! } : n))
        .sort((a, b) => {
          if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
        });
    });
    try {
      await reorderQuickNotes(merged);
    } catch {
      invalidate();
    }
  }

  const create = useMutation({
    mutationFn: () => createQuickNote({ content: draft.trim() || " ", color: draftColor, kind: "note" }),
    onSuccess: () => {
      setDraft("");
      setDraftColor("yellow");
      invalidate();
    },
  });

  const createBlank = useMutation({
    mutationFn: (kind: "note" | "list") =>
      createQuickNote({
        title: "",
        content: " ",
        color: kind === "list" ? "green" : "yellow",
        kind,
        items: kind === "list" ? [{ id: newItemId(), text: "", done: false }] : undefined,
      }),
    onSuccess: (note) => {
      invalidate();
      setEditing({
        id: note.id,
        title: note.title ?? "",
        content: (note.content ?? "").trim(),
        color: note.color,
        kind: note.kind ?? "note",
        items: note.items ?? [{ id: newItemId(), text: "", done: false }],
        isNew: true,
      });
    },
  });

  const saveEdit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateQuickNote>[1] }) =>
      updateQuickNote(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  async function closeEditor() {
    if (!editing) return;
    if (editSaveTimer.current) {
      clearTimeout(editSaveTimer.current);
      editSaveTimer.current = null;
    }
    // Only discard brand-new empty drafts. Emptied existing notes stay (may be recycled intentionally via trash).
    if (editing.isNew && isEmptyEdit(editing)) {
      try {
        await deleteQuickNotePermanent(editing.id);
        invalidate();
      } catch {
        // ignore
      }
      setEditing(null);
      return;
    }
    // Flush latest draft before closing so keystrokes aren't lost.
    if (!isEmptyEdit(editing)) {
      try {
        await updateQuickNote(editing.id, {
          title: editing.title,
          content: editing.kind === "list" ? " " : editing.content || " ",
          color: editing.color,
          items: editing.kind === "list" ? editing.items : undefined,
        });
        invalidate();
      } catch {
        // keep editor open? — still close; user can reopen
      }
    }
    setEditing(null);
  }

  function openNote(note: QuickNote) {
    if (selecting) {
      toggleSelect(note.id);
      return;
    }
    setEditing({
      id: note.id,
      title: note.title ?? "",
      content: note.content ?? "",
      color: note.color,
      kind: note.kind ?? "note",
      items: note.items?.length ? note.items : [{ id: newItemId(), text: "", done: false }],
      isNew: false,
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function enterSelect(id: string) {
    setSelected(new Set([id]));
  }

  async function bulkPatch(patch: Parameters<typeof updateQuickNote>[1]) {
    const ids = [...selected];
    await Promise.all(ids.map((id) => updateQuickNote(id, patch)));
    setSelected(new Set());
    invalidate();
  }

  async function bulkDelete() {
    if (!selected.size) return;
    setConfirmTrash(true);
  }

  async function confirmBulkDelete() {
    await Promise.all([...selected].map((id) => deleteQuickNote(id)));
    setSelected(new Set());
    setConfirmTrash(false);
    invalidate();
  }

  function onDraftKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() && !create.isPending) create.mutate();
    }
  }

  function persistEdit(next: EditState) {
    setEditing(next);
    if (editSaveTimer.current) clearTimeout(editSaveTimer.current);
    const seq = ++editSaveSeq.current;
    editSaveTimer.current = setTimeout(() => {
      void updateQuickNote(next.id, {
        title: next.title,
        content: next.kind === "list" ? " " : next.content || " ",
        color: next.color,
        items: next.kind === "list" ? next.items : undefined,
      }).then(() => {
        if (seq === editSaveSeq.current) invalidate();
      });
    }, 400);
  }

  const anySelectedPinned = [...selected].some((id) => notes.find((n) => n.id === id)?.pinned);
  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-14 xl:px-16 py-10 pb-28">
      <div className="text-center mb-6">
        <h1 className="text-xl font-medium">{showArchived ? "Archive" : "Capture"}</h1>
        <p className="text-sm text-secondary mt-1">
          {showArchived
            ? "Things you've set aside — bring them back whenever."
            : "Sticky thoughts & little lists — pin what matters."}
        </p>
      </div>

      {!showArchived && (
        <>
          <div className="flex gap-3 max-w-xl mx-auto mb-4">
            <button
              type="button"
              disabled={createBlank.isPending}
              onClick={() => createBlank.mutate("note")}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border glass-strong px-3 py-3.5 text-sm font-semibold hover:border-[rgb(234,179,8)]/50 hover:bg-[rgb(234,179,8)]/8 transition-colors"
            >
              <span className="h-8 w-8 rounded-xl inline-flex items-center justify-center bg-[rgb(234,179,8)]/15 text-[rgb(180,83,9)] dark:text-[rgb(234,179,8)]">
                <StickyNote size={15} />
              </span>
              Note
            </button>
            <button
              type="button"
              disabled={createBlank.isPending}
              onClick={() => createBlank.mutate("list")}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border glass-strong px-3 py-3.5 text-sm font-semibold hover:border-accent/50 hover:bg-accent-soft transition-colors"
            >
              <span className="icon-well h-8 w-8 rounded-xl">
                <ListTodo size={15} />
              </span>
              List
            </button>
          </div>

          <div
            className="rounded-xl border border-border glass p-5 mb-6 max-w-xl mx-auto shadow-card text-center"
            style={{ background: draftColor !== "gray" ? PALETTE[draftColor] : undefined }}
          >
            <textarea
              className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-secondary text-left max-h-40 overflow-y-auto"
              rows={2}
              placeholder="A quick thought…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKeyDown}
            />
            <div className="flex flex-col items-center gap-3 mt-3">
              <ColorDots value={draftColor} onPick={setDraftColor} />
              <Button variant="accent" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Adding…" : "Save"}
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => {
            setShowArchived((v) => !v);
            setSelected(new Set());
          }}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            showArchived ? "chip-active" : "chip-idle hover:text-primary"
          )}
        >
          <Archive size={13} />
          {showArchived ? "Exit archive" : `Archive${archivedCount ? ` (${archivedCount})` : ""}`}
        </button>
        <Link
          to="/recycle-bin"
          className="inline-flex items-center gap-1.5 rounded-full chip-idle px-3 py-1.5 text-xs font-semibold hover:text-primary"
        >
          <Trash2 size={13} />
          Recycle bin
        </Link>
      </div>

      {notes.length === 0 && (
        <EmptyState
          icon={StickyNote}
          title={showArchived ? "Nothing tucked away" : "Your pocket is empty"}
          subtitle={showArchived ? "Archived notes will land here." : "Jot something when it hits — notes or lists."}
          className="mb-6 max-w-md mx-auto py-10"
        />
      )}

      {notes.length > 1 && !showArchived && !selecting && (
        <p className="text-xs text-secondary text-center mb-4">
          Hold a note to select — drag the grip to rearrange
        </p>
      )}

      {pinned.length > 0 && (
        <>
          <p className="section-label mb-2">Pinned</p>
          <SortableNotesSection
            notes={pinned}
            enabled={!showArchived}
            className="mb-6"
            onReorder={(ids) => void persistOrder(pinned, ids)}
            renderCard={(note, { dragging }) => (
              <div
                className={clsx(dragging && "opacity-70")}
                onMouseEnter={() => setHoverNoteId(note.id)}
              >
                <NoteCard
                  note={note}
                  selected={selected.has(note.id)}
                  selecting={selecting}
                  onOpen={() => openNote(note)}
                  onSelectStart={() => enterSelect(note.id)}
                  onToggleSelect={() => toggleSelect(note.id)}
                />
              </div>
            )}
          />
        </>
      )}

      {rest.length > 0 && pinned.length > 0 && (
        <p className="section-label section-label-muted mb-2">Others</p>
      )}
      {rest.length > 0 && (
        <SortableNotesSection
          notes={rest}
          enabled={!showArchived}
          onReorder={(ids) => void persistOrder(rest, ids)}
          renderCard={(note, { dragging }) => (
            <div
              className={clsx(dragging && "opacity-70")}
              onMouseEnter={() => setHoverNoteId(note.id)}
            >
              <NoteCard
                note={note}
                selected={selected.has(note.id)}
                selecting={selecting}
                onOpen={() => openNote(note)}
                onSelectStart={() => enterSelect(note.id)}
                onToggleSelect={() => toggleSelect(note.id)}
              />
            </div>
          )}
        />
      )}

      {selecting && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-2xl border border-border glass-strong px-3 py-2 shadow-lg">
          <button type="button" onClick={() => setSelected(new Set())} className="p-1.5 text-primary">
            <X size={16} />
          </button>
          <span className="text-sm font-medium text-primary px-1">{selected.size} selected</span>
          <button
            type="button"
            title="Pin"
            className="p-1.5 text-secondary hover:text-accent"
            onClick={() => void bulkPatch({ pinned: !anySelectedPinned })}
          >
            <Star size={16} fill={anySelectedPinned ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            title={showArchived ? "Restore" : "Archive"}
            className="p-1.5 text-secondary hover:text-primary"
            onClick={() => void bulkPatch({ archived: !showArchived })}
          >
            {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button
            type="button"
            title="Trash"
            className="p-1.5 text-secondary hover:text-danger"
            onClick={() => void bulkDelete()}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmTrash}
        onOpenChange={setConfirmTrash}
        title={selected.size === 1 ? "Move to recycle bin?" : `Move ${selected.size} notes to recycle bin?`}
        message="You can restore them within 7 days."
        confirmLabel="Move"
        onConfirm={() => void confirmBulkDelete()}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) void closeEditor();
        }}
      >
        <DialogContent title={editing?.kind === "list" ? "List" : "Note"} className="max-w-2xl">
          {editing && (
            <div className="space-y-3">
              <input
                autoFocus={!!editing.isNew}
                className="w-full bg-transparent text-base font-medium text-primary placeholder:text-secondary focus:outline-none"
                placeholder={editing.kind === "list" ? "List title" : "Title"}
                value={editing.title}
                onChange={(e) => persistEdit({ ...editing, title: e.target.value })}
              />
              {editing.kind === "list" ? (
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                  {editing.items.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const items = editing.items.map((it) =>
                            it.id === item.id ? { ...it, done: !it.done } : it
                          );
                          persistEdit({ ...editing, items });
                        }}
                        className="text-secondary hover:text-accent"
                      >
                        {item.done ? <CheckSquare size={15} /> : <Square size={15} />}
                      </button>
                      <input
                        className={clsx(
                          "flex-1 bg-transparent text-sm focus:outline-none",
                          item.done && "line-through text-secondary"
                        )}
                        value={item.text}
                        placeholder="List item"
                        onChange={(e) => {
                          const items = editing.items.map((it) =>
                            it.id === item.id ? { ...it, text: e.target.value } : it
                          );
                          persistEdit({ ...editing, items });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const items = [...editing.items];
                            items.splice(idx + 1, 0, { id: newItemId(), text: "", done: false });
                            persistEdit({ ...editing, items });
                          }
                        }}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm text-secondary hover:text-accent"
                    onClick={() =>
                      persistEdit({
                        ...editing,
                        items: [...editing.items, { id: newItemId(), text: "", done: false }],
                      })
                    }
                  >
                    + List item
                  </button>
                </div>
              ) : (
                <textarea
                  autoFocus={!!editing.isNew && !editing.title}
                  className="w-full rounded-xl border border-border glass-input px-4 py-3 text-sm text-primary leading-relaxed
                             placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[220px] max-h-[50vh] overflow-y-auto"
                  placeholder="Write your note…"
                  value={editing.content}
                  onChange={(e) => persistEdit({ ...editing, content: e.target.value })}
                  style={{ background: editing.color !== "gray" ? PALETTE[editing.color] : undefined }}
                />
              )}
              <ColorDots
                value={editing.color}
                onPick={(color) => persistEdit({ ...editing, color })}
              />
              <div className="flex gap-2">
                <Button className="flex-1" variant="ghost" onClick={() => void closeEditor()}>
                  Done
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={saveEdit.isPending}
                  onClick={() =>
                    saveEdit.mutate({
                      id: editing.id,
                      patch: {
                        title: editing.title,
                        content: editing.kind === "list" ? " " : editing.content || " ",
                        color: editing.color,
                        items: editing.kind === "list" ? editing.items : undefined,
                      },
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
  selected,
  selecting,
  onOpen,
  onSelectStart,
  onToggleSelect,
}: {
  note: QuickNote;
  selected: boolean;
  selecting: boolean;
  onOpen: () => void;
  onSelectStart: () => void;
  onToggleSelect: () => void;
}) {
  const isList = note.kind === "list";
  const items = (note.items ?? []).filter((i) => i.text.trim() || !i.done).slice(0, 5);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);

  function clearHold() {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        onSelectStart();
      }}
      onPointerDown={() => {
        held.current = false;
        clearHold();
        holdTimer.current = window.setTimeout(() => {
          held.current = true;
          onSelectStart();
        }, 400);
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
      className={clsx(
        "relative rounded-xl border glass p-4 shadow-card transition-all duration-300 min-h-[72px] flex flex-col",
        selected ? "border-accent border-2" : "border-border hover:shadow-pop hover:-translate-y-0.5"
      )}
      style={{ background: note.color !== "gray" ? PALETTE[note.color] : undefined }}
    >
      <button
        type="button"
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          selecting ? onToggleSelect() : onOpen();
        }}
        className="w-full flex-1 text-left"
      >
        {isList ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <CheckSquare size={13} className="text-accent shrink-0" />
              <span className="truncate">{note.title?.trim() || "List"}</span>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-secondary">Tap to add items</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5 text-xs">
                  {item.done ? (
                    <CheckSquare size={12} className="text-accent shrink-0" />
                  ) : (
                    <Square size={12} className="text-secondary shrink-0" />
                  )}
                  <span className={clsx("truncate", item.done ? "text-secondary line-through" : "text-primary")}>
                    {item.text || "Item"}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {!!note.title?.trim() && (
              <p className="text-sm font-semibold text-primary line-clamp-2">{note.title}</p>
            )}
            {!!note.content.trim() && (
              <p className="text-sm whitespace-pre-wrap text-primary line-clamp-[14]">{note.content}</p>
            )}
            {!note.title?.trim() && !note.content.trim() && (
              <p className="text-xs text-secondary">Empty note</p>
            )}
          </div>
        )}
      </button>
      {note.pinned && !selecting && (
        <Star size={12} className="text-accent absolute self-end" fill="currentColor" />
      )}
    </div>
  );
}
