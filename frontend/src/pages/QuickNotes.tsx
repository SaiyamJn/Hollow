import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckSquare,
  FileDown,
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

const PALETTE: Record<string, { bg: string; border: string }> = {
  gray: {
    bg: "var(--surface-1)",
    border: "var(--border)",
  },
  yellow: {
    bg: "var(--note-yellow)",
    border: "var(--note-yellow-border)",
  },
  green: {
    bg: "var(--note-green)",
    border: "var(--note-green-border)",
  },
  blue: {
    bg: "var(--note-blue)",
    border: "var(--note-blue-border)",
  },
  red: {
    bg: "var(--note-red)",
    border: "var(--note-red-border)",
  },
  purple: {
    bg: "var(--note-purple)",
    border: "var(--note-purple-border)",
  },
};

export function getNoteGlassStyle(color?: string) {
  const c = color && PALETTE[color] ? PALETTE[color] : PALETTE.gray;
  return {
    backgroundColor: c.bg,
    borderColor: c.border,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  };
}

const DOT_COLORS: Record<string, string> = {
  gray: "rgba(128, 128, 128, 0.55)",
  yellow: "rgba(234, 179, 8, 0.85)",
  green: "rgba(34, 197, 94, 0.85)",
  blue: "rgba(56, 189, 248, 0.85)",
  red: "rgba(244, 63, 94, 0.85)",
  purple: "rgba(168, 85, 247, 0.85)",
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
            "h-4 w-4 rounded-full border transition-transform hover:scale-110",
            value === color ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-secondary"
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("gray");
  const [takeNoteOpen, setTakeNoteOpen] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [confirmDeleteEdit, setConfirmDeleteEdit] = useState(false);
  const [hoverNoteId, setHoverNoteId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    const parent = el.parentElement;
    const prevScrollTop = parent?.scrollTop;
    el.style.height = "auto";
    const newHeight = Math.max(el.scrollHeight, 180);
    el.style.height = `${newHeight}px`;
    if (parent && prevScrollTop !== undefined) {
      parent.scrollTop = prevScrollTop;
    }
  };

  useEffect(() => {
    if (editing && editing.kind === "note") {
      requestAnimationFrame(adjustTextareaHeight);
    }
  }, [editing?.content, editing?.id, editing?.kind]);

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "new-list") {
      setSearchParams({}, { replace: true });
      createBlank.mutate("list");
    } else if (action === "new-note") {
      setSearchParams({}, { replace: true });
      createBlank.mutate("note");
    }
  }, [searchParams, setSearchParams]);

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

  // Close archive on Escape
  useEffect(() => {
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape" && showArchived && !editing && !confirmTrash && !confirmDeleteEdit) {
        e.preventDefault();
        setShowArchived(false);
      }
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showArchived, editing, confirmTrash, confirmDeleteEdit]);

  // Close archive on browser back button
  useEffect(() => {
    if (showArchived) {
      window.history.pushState({ hollowArchive: true }, "");
      const onPop = () => {
        setShowArchived(false);
      };
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
      };
    }
  }, [showArchived]);

  // Also close archive when navigating away from notes section
  useEffect(() => {
    return () => {
      setShowArchived(false);
    };
  }, []);

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
    mutationFn: () =>
      createQuickNote({
        content: draft.trim() || " ",
        color: draftColor,
        kind: "note",
        archived: showArchived,
      }),
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
        archived: showArchived,
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
    const cleanItems = editing.kind === "list"
      ? editing.items.filter((it) => it.text.trim() !== "")
      : undefined;
    const effectiveEdit = {
      ...editing,
      items: cleanItems ?? editing.items,
    };
    // Auto-delete notes/lists that end up empty (no title, no content, no items).
    // Brand-new drafts are removed outright; an existing note that's emptied goes
    // to the recycle bin so it can still be restored within 7 days.
    if (isEmptyEdit(effectiveEdit)) {
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
          items: cleanItems,
        });
        invalidate();
      } catch {
        // keep editor open? — still close; user can reopen
      }
    }
    setEditing(null);
  }

  async function deleteFromEditor() {
    if (!editing) return;
    if (editSaveTimer.current) {
      clearTimeout(editSaveTimer.current);
      editSaveTimer.current = null;
    }
    if (emptyDeleteTimer.current) {
      clearTimeout(emptyDeleteTimer.current);
      emptyDeleteTimer.current = null;
    }
    try {
      await deleteQuickNote(editing.id);
      invalidate();
    } catch {
      // ignore
    }
    setConfirmDeleteEdit(false);
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

  function pickEditColor(color: string) {
    if (!editing) return;
    const next = { ...editing, color };
    setEditing(next);
    if (editSaveTimer.current) clearTimeout(editSaveTimer.current);
    const seq = ++editSaveSeq.current;
    void updateQuickNote(next.id, {
      title: next.title,
      content: next.kind === "list" ? " " : next.content || " ",
      color,
      items: next.kind === "list" ? next.items : undefined,
    }).then(() => {
      if (seq === editSaveSeq.current) invalidate();
    });
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

  const currentEditingNote = (library ?? []).find((n) => n.id === editing?.id);
  const editingNotePinned = currentEditingNote?.pinned ?? false;
  const editingNoteArchived = currentEditingNote?.archived ?? (showArchived || false);

  async function togglePinEditing() {
    if (!editing) return;
    await updateQuickNote(editing.id, { pinned: !editingNotePinned });
    invalidate();
  }

  async function toggleArchiveEditing() {
    if (!editing) return;
    await updateQuickNote(editing.id, { archived: !editingNoteArchived });
    invalidate();
    void closeEditor();
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-14 xl:px-16 py-10 pb-28">
      {showArchived ? (
        /* Minimalist Archive View: Clean header without clutter or duplicate buttons */
        <div className="flex items-center justify-between max-w-4xl mx-auto mb-8 px-2">
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-surface-1 hover:bg-surface-2 px-3.5 py-2 text-xs font-medium text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Notes
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-primary">
              Archive {archivedCount > 0 ? `(${archivedCount})` : ""}
            </span>
            <div className="flex items-center gap-1.5 border-l border-border/60 pl-3">
              <button
                type="button"
                disabled={createBlank.isPending}
                onClick={() => createBlank.mutate("note")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface-1 hover:bg-surface-2 px-2.5 py-1 text-xs font-medium text-secondary hover:text-primary transition-colors"
              >
                <StickyNote size={13} />
                + Note
              </button>
              <button
                type="button"
                disabled={createBlank.isPending}
                onClick={() => createBlank.mutate("list")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface-1 hover:bg-surface-2 px-2.5 py-1 text-xs font-medium text-secondary hover:text-primary transition-colors"
              >
                <CheckSquare size={13} />
                + List
              </button>
            </div>
          </div>
          <Link
            to="/recycle-bin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/40 bg-surface-1/60 hover:bg-surface-2 px-3 py-1.5 text-xs text-secondary hover:text-primary transition-colors"
          >
            <Trash2 size={13} />
            Recycle bin
          </Link>
        </div>
      ) : (
        /* Google Keep Style Minimal "Take a note..." Bar with Translucent Glassmorphism */
        <div className="max-w-2xl mx-auto mb-8">
          {!takeNoteOpen ? (
            <div
              onClick={() => setTakeNoteOpen(true)}
              className="flex items-center justify-between rounded-xl border border-border/80 glass hover:border-border px-4 py-3 shadow-sm cursor-pointer transition-colors"
            >
              <span className="text-sm text-secondary/70 font-normal">Take a note…</span>
              <div className="flex items-center gap-1 text-secondary" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  title="New list"
                  disabled={createBlank.isPending}
                  onClick={() => createBlank.mutate("list")}
                  className="p-2 rounded-lg hover:text-primary hover:bg-surface-2 transition-colors"
                >
                  <CheckSquare size={17} />
                </button>
                <button
                  type="button"
                  title="New note"
                  disabled={createBlank.isPending}
                  onClick={() => createBlank.mutate("note")}
                  className="p-2 rounded-lg hover:text-primary hover:bg-surface-2 transition-colors"
                >
                  <StickyNote size={17} />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="rounded-2xl border p-4 shadow-md transition-all"
              style={getNoteGlassStyle(draftColor)}
            >
              <textarea
                autoFocus
                rows={3}
                className="w-full bg-transparent resize-none border-0 outline-none text-sm leading-relaxed text-primary placeholder:text-secondary/60 focus:ring-0"
                placeholder="Take a note…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onDraftKeyDown}
              />
              <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-2">
                <ColorDots value={draftColor} onPick={setDraftColor} />
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    className="text-xs px-3 py-1.5"
                    onClick={() => {
                      setTakeNoteOpen(false);
                      setDraft("");
                      setDraftColor("gray");
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    variant="accent"
                    className="text-xs px-3 py-1.5"
                    disabled={!draft.trim() || create.isPending}
                    onClick={() => {
                      create.mutate(undefined, {
                        onSuccess: () => setTakeNoteOpen(false),
                      });
                    }}
                  >
                    {create.isPending ? "Adding…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Quick links to Archive and Recycle bin */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowArchived(true);
                setSelected(new Set());
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold chip-idle hover:text-primary transition-colors"
            >
              <Archive size={13} />
              {`Archive${archivedCount ? ` (${archivedCount})` : ""}`}
            </button>
            <Link
              to="/recycle-bin"
              className="inline-flex items-center gap-1.5 rounded-full chip-idle px-3 py-1.5 text-xs font-semibold hover:text-primary transition-colors"
            >
              <Trash2 size={13} />
              Recycle bin
            </Link>
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
            {Object.keys(PALETTE).map((color) => (
              <button
                key={color}
                type="button"
                title={`Set color to ${color}`}
                onClick={() => void bulkPatch({ color })}
                className="h-3.5 w-3.5 rounded-full border border-border hover:scale-110 transition-transform"
                style={{ background: DOT_COLORS[color] }}
              />
            ))}
          </div>
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
        <DialogContent
          hideHeader
          title={editing?.kind === "list" ? "List" : "Note"}
          className="w-[min(94vw,50rem)] max-w-3xl p-5 sm:p-6 rounded-3xl border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          style={getNoteGlassStyle(editing?.color || "gray")}
        >
          {editing && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Google Keep Header: Title + Star/Pin Icon */}
              <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
                <input
                  autoFocus={!!editing.isNew}
                  className="w-full bg-transparent text-xl font-medium text-primary placeholder:text-secondary/60 focus:outline-none border-0 p-0"
                  placeholder="Title"
                  value={editing.title}
                  onChange={(e) => persistEdit({ ...editing, title: e.target.value })}
                />
                <button
                  type="button"
                  title={editingNotePinned ? "Unpin note" : "Pin note"}
                  onClick={() => void togglePinEditing()}
                  className="p-1.5 rounded-full text-secondary hover:text-primary hover:bg-surface-2/60 transition-colors shrink-0"
                >
                  <Star
                    size={20}
                    className={clsx(
                      editingNotePinned ? "text-accent fill-accent" : "text-secondary hover:text-primary"
                    )}
                  />
                </button>
              </div>

              {/* Note Content / Checklist items - dynamically sizes and scrolls */}
              <div className="flex-1 min-h-[180px] overflow-y-auto py-2 pr-1 overscroll-contain">
                {editing.kind === "list" ? (
                  <div className="space-y-1.5 min-h-[180px]">
                    {[...editing.items]
                      .sort((a, b) => Number(a.done) - Number(b.done))
                      .map((item) => (
                        <div key={item.id} className="flex items-center gap-2 group/item">
                          <button
                            type="button"
                            onClick={() => {
                              const items = editing.items.map((it) =>
                                it.id === item.id ? { ...it, done: !it.done } : it
                              );
                              persistEdit({ ...editing, items });
                            }}
                            className="text-secondary hover:text-accent shrink-0"
                          >
                            {item.done ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                          <input
                            data-item-id={item.id}
                            className={clsx(
                              "flex-1 bg-transparent text-sm focus:outline-none border-0 p-0",
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
                                const curIndex = editing.items.findIndex((it) => it.id === item.id);
                                const newId = newItemId();
                                const items = [...editing.items];
                                items.splice(curIndex >= 0 ? curIndex + 1 : items.length, 0, {
                                  id: newId,
                                  text: "",
                                  done: false,
                                });
                                persistEdit({ ...editing, items });
                                setTimeout(() => {
                                  const el = document.querySelector(`[data-item-id="${newId}"]`) as HTMLInputElement | null;
                                  el?.focus();
                                }, 10);
                              } else if (e.key === "Backspace" && item.text === "" && editing.items.length > 1) {
                                e.preventDefault();
                                const curIndex = editing.items.findIndex((it) => it.id === item.id);
                                const prevItem = curIndex > 0 ? editing.items[curIndex - 1] : editing.items[curIndex + 1];
                                const items = editing.items.filter((it) => it.id !== item.id);
                                persistEdit({ ...editing, items });
                                if (prevItem) {
                                  setTimeout(() => {
                                    const el = document.querySelector(`[data-item-id="${prevItem.id}"]`) as HTMLInputElement | null;
                                    el?.focus();
                                  }, 10);
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            title="Delete item"
                            className="p-1 rounded text-secondary/40 hover:text-danger hover:bg-surface-2 transition-colors shrink-0 opacity-60 hover:opacity-100"
                            onClick={() => {
                              const items = editing.items.filter((it) => it.id !== item.id);
                              persistEdit({
                                ...editing,
                                items: items.length ? items : [{ id: newItemId(), text: "", done: false }],
                              });
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    <button
                      type="button"
                      className="text-xs text-secondary hover:text-primary mt-1 font-medium transition-colors"
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
                    ref={textareaRef}
                    autoFocus={!!editing.isNew && !editing.title}
                    className="w-full min-h-[180px] bg-transparent border-0 outline-none p-0 text-base text-primary leading-relaxed
                               placeholder:text-secondary/60 focus:ring-0 resize-none overflow-hidden"
                    placeholder="Note"
                    value={editing.content}
                    onChange={(e) => {
                      persistEdit({ ...editing, content: e.target.value });
                      adjustTextareaHeight();
                    }}
                  />
                )}
              </div>

              {/* Google Keep Bottom Toolbar - Always pinned and visible */}
              <div className="shrink-0 pt-3 flex items-center justify-between gap-3 border-t border-border/30 mt-auto">
                <div className="flex items-center gap-1">
                  <div className="mr-2">
                    <ColorDots
                      value={editing.color}
                      onPick={pickEditColor}
                    />
                  </div>
                  <button
                    type="button"
                    title={editingNoteArchived ? "Unarchive note" : "Archive note"}
                    className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-2/60 transition-colors"
                    onClick={() => void toggleArchiveEditing()}
                  >
                    {editingNoteArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                  <button
                    type="button"
                    title="Delete note"
                    className="p-2 rounded-lg text-secondary hover:text-danger hover:bg-surface-2/60 transition-colors"
                    onClick={() => setConfirmDeleteEdit(true)}
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    type="button"
                    title="Export as Markdown"
                    className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-2/60 transition-colors"
                    onClick={exportNote}
                  >
                    <FileDown size={16} />
                  </button>
                  <button
                    type="button"
                    title="Export as PDF"
                    className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-2/60 transition-colors"
                    onClick={exportNotePdf}
                  >
                    <Printer size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    className="text-xs font-semibold px-4 py-1.5"
                    onClick={() => void closeEditor()}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteEdit}
        onOpenChange={setConfirmDeleteEdit}
        title="Move to recycle bin?"
        message="You can restore it within 7 days."
        confirmLabel="Move"
        onConfirm={() => void deleteFromEditor()}
      />
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
        "relative rounded-xl border p-4 shadow-card transition-all duration-300 min-h-[72px] flex flex-col",
        selected ? "border-accent ring-2 ring-accent" : "hover:shadow-pop hover:-translate-y-0.5"
      )}
      style={{
        ...getNoteGlassStyle(note.color),
        ...(selected ? { borderColor: "var(--accent)" } : {}),
      }}
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
