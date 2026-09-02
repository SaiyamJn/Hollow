import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  FileDown,
  ListTodo,
  Printer,
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
import { downloadMarkdown, printHtml } from "../lib/export";

const PALETTE: Record<string, string> = {
  gray: "transparent",
  yellow: "var(--note-yellow)",
  green: "var(--note-green)",
  blue: "var(--note-blue)",
  red: "var(--note-red)",
  purple: "var(--note-purple)",
};

const DOT_COLORS: Record<string, string> = {
  gray: "rgba(128, 128, 128, 0.6)",
  yellow: "rgb(250, 184, 8)",
  green: "rgb(16, 185, 129)",
  blue: "rgb(59, 130, 246)",
  red: "rgb(244, 63, 94)",
  purple: "rgb(168, 85, 247)",
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
  const [draftFocus, setDraftFocus] = useState(false);
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
  const emptyDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emptyDeleteSeq = useRef(0);

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
    if (emptyDeleteTimer.current) {
      clearTimeout(emptyDeleteTimer.current);
      emptyDeleteTimer.current = null;
    }
    // Auto-delete notes/lists that end up empty (no title, no content, no items).
    // Brand-new drafts are removed outright; an existing note that's emptied goes
    // to the recycle bin so it can still be restored within 7 days.
    if (isEmptyEdit(editing)) {
      try {
        if (editing.isNew) {
          await deleteQuickNotePermanent(editing.id);
        } else {
          await deleteQuickNote(editing.id);
        }
        invalidate();
      } catch {
        // ignore
      }
      setEditing(null);
      return;
    }
    // Flush latest draft before closing so keystrokes aren't lost.
    {
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

    // Auto-delete the note the moment it becomes empty while editing, so an
    // emptied note/list doesn't linger in the collection. Brand-new drafts are
    // removed outright; an existing note goes to the recycle bin (restorable).
    if (emptyDeleteTimer.current) clearTimeout(emptyDeleteTimer.current);
    if (isEmptyEdit(next)) {
      const delSeq = ++emptyDeleteSeq.current;
      emptyDeleteTimer.current = setTimeout(() => {
        if (delSeq !== emptyDeleteSeq.current) return;
        if (editSaveTimer.current) {
          clearTimeout(editSaveTimer.current);
          editSaveTimer.current = null;
        }
        void (next.isNew
          ? deleteQuickNotePermanent(next.id)
          : deleteQuickNote(next.id)
        ).then(() => {
          if (delSeq !== emptyDeleteSeq.current) return;
          invalidate();
          setEditing((cur) => (cur?.id === next.id ? null : cur));
        });
      }, 800);
    }
  }

  function exportNote() {
    if (!editing) return;
    const name = editing.title?.trim() || (editing.kind === "list" ? "List" : "Note");
    if (editing.kind === "list") {
      const md = editing.items
        .map((i) => `${i.done ? "- [x]" : "- [ ]"} ${i.text.trim() || "Item"}`)
        .join("\n");
      downloadMarkdown(name, md);
      return;
    }
    const md = editing.content.trim();
    downloadMarkdown(name, md || " ");
  }

  function exportNotePdf() {
    if (!editing) return;
    const name = editing.title?.trim() || (editing.kind === "list" ? "List" : "Note");
    if (editing.kind === "list") {
      const rows = editing.items
        .map((i) => `<li>${i.done ? "☑" : "☐"} ${escapeText(i.text.trim() || "Item")}</li>`)
        .join("");
      printHtml(name, `<ul>${rows}</ul>`);
      return;
    }
    const body = editing.content
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeText(p).replace(/\n/g, "<br/>")}</p>`)
      .join("");
    printHtml(name, body || "<p></p>");
  }

  function escapeText(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border glass-strong px-3 py-3.5 text-sm font-semibold hover:border-[rgb(250,184,8)]/50 hover:bg-[rgb(250,184,8)]/12 transition-colors"
            >
              <span className="h-8 w-8 rounded-xl inline-flex items-center justify-center bg-[rgb(250,184,8)]/22 text-[rgb(180,83,9)] dark:text-[rgb(250,204,21)]">
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
            className="rounded-xl border border-border glass p-5 mb-6 max-w-2xl mx-auto shadow-card text-center"
            style={{ background: draftColor !== "gray" ? PALETTE[draftColor] : undefined }}
          >
            <textarea
              className={clsx(
                "w-full bg-transparent resize-none focus:outline-none placeholder:text-secondary text-left overflow-y-auto",
                draftFocus || draft.length > 80 ? "min-h-[220px] max-h-[55vh] text-base leading-relaxed" : "max-h-40 text-sm"
              )}
              rows={draftFocus || draft.length > 80 ? 10 : 3}
              placeholder="A quick thought…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKeyDown}
              onFocus={() => setDraftFocus(true)}
              onBlur={() => setDraftFocus(false)}
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
        <DialogContent title={editing?.kind === "list" ? "List" : "Note"} className="max-w-3xl">
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
                  {[...editing.items]
                    .sort((a, b) => Number(a.done) - Number(b.done))
                    .map((item, idx) => (
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
                  className="w-full rounded-xl border border-border glass-input px-5 py-4 text-base text-primary leading-relaxed
                             placeholder:text-secondary focus:outline-none focus:border-accent resize-none min-h-[min(55vh,28rem)] max-h-[70vh] overflow-y-auto"
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
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  title="Export as Markdown"
                  className="p-1.5 rounded-md text-secondary hover:text-primary transition-colors"
                  onClick={exportNote}
                >
                  <FileDown size={14} />
                </button>
                <button
                  type="button"
                  title="Export as PDF"
                  className="p-1.5 rounded-md text-secondary hover:text-primary transition-colors"
                  onClick={exportNotePdf}
                >
                  <Printer size={14} />
                </button>
                <span className="flex-1" />
                <Button className="flex-1 max-w-[10rem]" variant="ghost" onClick={() => void closeEditor()}>
                  Done
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={saveEdit.isPending}
                  onClick={() => {
                    if (!editing) return;
                    // An emptied note/list is deleted (new → permanent, existing → recycle bin)
                    // instead of being saved as a blank note.
                    if (isEmptyEdit(editing)) {
                      void closeEditor();
                      return;
                    }
                    saveEdit.mutate({
                      id: editing.id,
                      patch: {
                        title: editing.title,
                        content: editing.kind === "list" ? " " : editing.content || " ",
                        color: editing.color,
                        items: editing.kind === "list" ? editing.items : undefined,
                      },
                    });
                  }}
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
  // Show open (unchecked) items first, completed items last — mirror the editor.
  const items = (note.items ?? [])
    .filter((i) => i.text.trim() || !i.done)
    .sort((a, b) => Number(a.done) - Number(b.done))
    .slice(0, 5);
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
