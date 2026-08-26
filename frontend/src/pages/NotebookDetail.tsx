import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  Waypoints,
} from "lucide-react";
import {
  createPage,
  createSection,
  deleteNotebook,
  deletePage,
  deleteSection,
  fetchNotebooks,
  lockNotebook,
  lockSection,
  renameNotebook,
  renamePage,
  renameSection,
  removeNotebookLock,
  removeSectionLock,
  unlockNotebook,
  unlockSection,
} from "../lib/api";
import type { Section } from "../lib/types";
import { useUnlockStore } from "../stores/unlock";
import { useUiStore } from "../stores/ui";
import { PasswordDialog } from "../components/PasswordDialog";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { shouldHandleItemDelete } from "../lib/keys";

type DialogKind =
  | { kind: "unlock-notebook" }
  | { kind: "unlock-section"; section: Section; thenOpen?: { pageId: string; title: string }; thenCreatePage?: boolean }
  | { kind: "lock-notebook" }
  | { kind: "lock-section"; section: Section }
  | { kind: "remove-lock-notebook" }
  | { kind: "remove-lock-section"; section: Section }
  | { kind: "new-section" }
  | { kind: "new-page"; section: Section }
  | null;

type EditTarget =
  | { kind: "notebook"; title: string }
  | { kind: "section"; section: Section; title: string }
  | { kind: "page"; id: string; title: string }
  | null;

// Inside one notebook: sections drop down into pages (matches the mobile drill-down).
export default function NotebookDetail() {
  const { notebookId } = useParams<{ notebookId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveNotebook = useUiStore((s) => s.setActiveNotebook);
  const unlockStore = useUnlockStore();
  const { sectionPasswords, notebookPasswords, unlockedNotebooks } = unlockStore;

  const { data: notebooks, isLoading } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const notebook = notebooks?.find((nb) => nb.id === notebookId);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<Section | null>(null);
  const [deletePageTarget, setDeletePageTarget] = useState<{ id: string; title: string } | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [activeItem, setActiveItem] = useState<
    | { kind: "notebook" }
    | { kind: "section"; section: Section }
    | { kind: "page"; id: string; title: string }
    | null
  >(null);

  useEffect(() => {
    if (notebookId) setActiveNotebook(notebookId);
  }, [notebookId, setActiveNotebook]);

  useEffect(() => {
    if (notebook?.isLocked && !unlockedNotebooks[notebook.id]) {
      setDialog({ kind: "unlock-notebook" });
    }
  }, [notebook, unlockedNotebooks]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!shouldHandleItemDelete(e)) return;
      if (notebook?.isLocked && !unlockedNotebooks[notebook.id]) return;
      if (!activeItem) return;
      e.preventDefault();
      if (activeItem.kind === "notebook") setConfirmDelete(true);
      else if (activeItem.kind === "section") setDeleteSectionTarget(activeItem.section);
      else setDeletePageTarget({ id: activeItem.id, title: activeItem.title });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeItem, notebook, unlockedNotebooks]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notebooks"] });

  const createSec = useMutation({
    mutationFn: (title: string) =>
      createSection(
        notebookId!,
        title,
        notebookPasswords[notebookId!] ??
          notebook?.sections.map((s) => sectionPasswords[s.id]).find(Boolean)
      ),
    onSuccess: (sec) => {
      invalidate();
      const pw =
        notebookPasswords[notebookId!] ??
        notebook?.sections.map((s) => sectionPasswords[s.id]).find(Boolean);
      if (pw && sec.isLocked) unlockStore.setSectionPassword(sec.id, pw);
      setExpanded((s) => new Set(s).add(sec.id));
      setDialog(null);
      setDraft("");
    },
  });

  const createPg = useMutation({
    mutationFn: ({ section, title }: { section: Section; title: string }) =>
      createPage(section.id, title, sectionPasswords[section.id]),
    onSuccess: (page, vars) => {
      invalidate();
      setDialog(null);
      setDraft("");
      navigate(`/notebooks/${notebookId}/sections/${vars.section.id}/pages/${page.id}`, {
        state: { autoFocus: true },
      });
    },
  });

  const removeNotebook = useMutation({
    mutationFn: () => deleteNotebook(notebookId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      setActiveNotebook(null);
      navigate("/notebooks");
    },
  });

  const removeSection = useMutation({
    mutationFn: (id: string) => deleteSection(id),
    onSuccess: () => {
      invalidate();
      setDeleteSectionTarget(null);
    },
  });

  const removePage = useMutation({
    mutationFn: (id: string) => deletePage(id),
    onSuccess: () => {
      invalidate();
      setDeletePageTarget(null);
    },
  });

  const rename = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      const title = editTarget.title.trim();
      if (editTarget.kind === "notebook") await renameNotebook(notebookId!, title);
      else if (editTarget.kind === "section") await renameSection(editTarget.section.id, title);
      else await renamePage(editTarget.id, title);
    },
    onSuccess: () => {
      invalidate();
      setEditTarget(null);
    },
  });

  function toggleSection(sec: Section) {
    if (sec.isLocked && !sectionPasswords[sec.id]) {
      setDialog({ kind: "unlock-section", section: sec });
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sec.id) ? next.delete(sec.id) : next.add(sec.id);
      return next;
    });
  }

  function openPage(sec: Section, pageId: string, title: string) {
    if (sec.isLocked && !sectionPasswords[sec.id]) {
      setDialog({ kind: "unlock-section", section: sec, thenOpen: { pageId, title } });
      return;
    }
    navigate(`/notebooks/${notebookId}/sections/${sec.id}/pages/${pageId}`);
  }

  function startNewPage(sec: Section) {
    if (sec.isLocked && !sectionPasswords[sec.id]) {
      setDialog({ kind: "unlock-section", section: sec, thenCreatePage: true });
      return;
    }
    setExpanded((s) => new Set(s).add(sec.id));
    setDraft("");
    setDialog({ kind: "new-page", section: sec });
  }

  if (isLoading) {
    return <p className="px-7 py-10 text-sm text-secondary">Loading…</p>;
  }

  if (!notebook) {
    return (
      <div className="px-7 py-10 space-y-3">
        <p className="text-sm text-secondary">Notebook not found.</p>
        <Link to="/notebooks" className="text-sm text-accent hover:underline">
          Back to notebooks
        </Link>
      </div>
    );
  }

  const sealed = notebook.isLocked && !unlockedNotebooks[notebook.id];
  const createError =
    ((createSec.error || createPg.error) as any)?.response?.data?.error ??
    (createSec.error || createPg.error ? "Couldn't create." : null);
  const renameError =
    (rename.error as any)?.response?.data?.error ?? (rename.error ? "Couldn't save." : null);

  return (
    <div className="w-full max-w-[1200px] mx-auto px-6 sm:px-10 lg:px-14 py-10 animate-rise-in">
      <Link
        to="/notebooks"
        className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-accent mb-5"
      >
        <ArrowLeft size={12} /> All notebooks
      </Link>

      <div
        className="flex flex-col items-center text-center gap-4 mb-6"
        onMouseEnter={() => setActiveItem({ kind: "notebook" })}
      >
        <div className="min-w-0 w-full">
          <h1 className="text-xl font-medium truncate">{notebook.title}</h1>
          <p className="text-sm text-secondary mt-1">
            {sealed
              ? "Sealed — unlock to browse"
              : `${notebook.sections.length} sections · ${notebook.sections.reduce((n, s) => n + s.pages.length, 0)} pages`}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button
            title="Rename notebook"
            onClick={() => setEditTarget({ kind: "notebook", title: notebook.title })}
          >
            <Pencil size={14} />
          </Button>
          {!notebook.isLocked && (
            <Button title="Lock notebook" onClick={() => setDialog({ kind: "lock-notebook" })} disabled={sealed}>
              <LockOpen size={14} />
            </Button>
          )}
          {notebook.isLocked && unlockedNotebooks[notebook.id] && (
            <Button
              title="Re-lock for this session"
              onClick={() => unlockStore.relockNotebook(notebook.id, notebook.sections.map((s) => s.id))}
            >
              <Lock size={14} />
            </Button>
          )}
          {notebook.isLocked && (
            <Button
              title="Remove password"
              onClick={() => setDialog({ kind: "remove-lock-notebook" })}
            >
              <ShieldOff size={14} />
            </Button>
          )}
          <Button
            title="Graph"
            onClick={() => navigate(`/notebooks/${notebook.id}/graph`)}
            disabled={sealed}
          >
            <Waypoints size={14} />
          </Button>
          <Button title="Delete notebook" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
          </Button>
          <Button variant="accent" onClick={() => setDialog({ kind: "new-section" })} disabled={sealed}>
            <span className="inline-flex items-center gap-1.5">
              <Plus size={14} /> Section
            </span>
          </Button>
          <Link
            to="/recycle-bin?tab=pages"
            className="inline-flex items-center gap-1.5 rounded-full chip-idle px-3 py-1.5 text-xs font-semibold hover:text-primary"
          >
            <Trash2 size={13} />
            Recycle bin
          </Link>
        </div>
      </div>

      {sealed ? (
        <div className="rounded-2xl border border-border glass py-14 flex flex-col items-center gap-3">
          <Lock size={22} className="text-secondary" />
          <p className="text-sm text-secondary">This notebook is sealed.</p>
          <Button variant="accent" onClick={() => setDialog({ kind: "unlock-notebook" })}>
            Unlock
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {notebook.sections.length === 0 && (
            <p className="text-sm text-secondary py-8 text-center">
              No sections yet — add one and start writing.
            </p>
          )}
          {notebook.sections.map((sec) => {
            const secSealed = sec.isLocked && !sectionPasswords[sec.id];
            const open = expanded.has(sec.id) && !secSealed;
            return (
              <div
                key={sec.id}
                className="rounded-xl border border-border glass overflow-hidden"
                onMouseEnter={() => setActiveItem({ kind: "section", section: sec })}
              >
                <div
                  className="group flex items-center gap-1 px-2 py-1.5 hover:bg-surface-2/60 transition-colors"
                  onMouseEnter={() => setActiveItem({ kind: "section", section: sec })}
                >
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-2.5 px-1.5 py-1.5 text-left min-w-0"
                    onClick={() => toggleSection(sec)}
                  >
                    {open ? (
                      <ChevronDown size={15} className="text-secondary shrink-0" />
                    ) : (
                      <ChevronRight size={15} className="text-secondary shrink-0" />
                    )}
                    <Layers size={14} className="text-accent shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{sec.title}</span>
                    {sec.isLocked && (
                      <Lock size={12} className={secSealed ? "text-secondary" : "text-accent"} />
                    )}
                    <span className="text-xs text-secondary">{sec.pages.length}</span>
                  </button>
                  <div className="row-actions flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title="New page"
                      className="p-1.5 rounded-md text-secondary hover:text-accent"
                      onClick={() => startNewPage(sec)}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      title="Rename section"
                      className="p-1.5 rounded-md text-secondary hover:text-primary"
                      onClick={() => setEditTarget({ kind: "section", section: sec, title: sec.title })}
                    >
                      <Pencil size={14} />
                    </button>
                    {!sec.isLocked && (
                      <button
                        type="button"
                        title="Lock section"
                        className="p-1.5 rounded-md text-secondary hover:text-primary"
                        onClick={() => setDialog({ kind: "lock-section", section: sec })}
                      >
                        <LockOpen size={14} />
                      </button>
                    )}
                    {sec.isLocked && sectionPasswords[sec.id] && (
                      <button
                        type="button"
                        title="Re-lock for this session"
                        className="p-1.5 rounded-md text-secondary hover:text-primary"
                        onClick={() => unlockStore.relockSection(sec.id)}
                      >
                        <Lock size={14} />
                      </button>
                    )}
                    {sec.isLocked && (
                      <button
                        type="button"
                        title="Remove password"
                        className="p-1.5 rounded-md text-secondary hover:text-primary"
                        onClick={() => setDialog({ kind: "remove-lock-section", section: sec })}
                      >
                        <ShieldOff size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete section"
                      className="p-1.5 rounded-md text-secondary hover:text-danger"
                      onClick={() => setDeleteSectionTarget(sec)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-border px-3.5 py-2 space-y-0.5">
                    {sec.pages.map((page) => (
                      <div
                        key={page.id}
                        className="group/page flex items-center gap-1 rounded-md hover:bg-surface-2 transition-colors"
                        onMouseEnter={() => setActiveItem({ kind: "page", id: page.id, title: page.title })}
                      >
                        <button
                          type="button"
                          className="flex-1 flex items-center gap-2 px-2 py-2 text-sm text-secondary
                                     hover:text-primary text-left min-w-0"
                          onClick={() => openPage(sec, page.id, page.title)}
                        >
                          <FileText size={13} className="shrink-0" />
                          <span className="truncate flex-1">{page.title}</span>
                        </button>
                        <button
                          type="button"
                          title="Rename page"
                          className="p-1.5 rounded-md text-secondary hover:text-primary shrink-0"
                          onClick={() => setEditTarget({ kind: "page", id: page.id, title: page.title })}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          title="Delete page"
                          className="p-1.5 rounded-md text-secondary hover:text-danger shrink-0"
                          onClick={() => setDeletePageTarget({ id: page.id, title: page.title })}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-secondary
                                 hover:text-accent transition-colors"
                      onClick={() => startNewPage(sec)}
                    >
                      <Plus size={13} /> New page
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PasswordDialog
        open={
          dialog?.kind === "unlock-notebook" ||
          dialog?.kind === "unlock-section" ||
          dialog?.kind === "lock-notebook" ||
          dialog?.kind === "lock-section" ||
          dialog?.kind === "remove-lock-notebook" ||
          dialog?.kind === "remove-lock-section"
        }
        onOpenChange={(o) => !o && setDialog(null)}
        title={
          dialog?.kind === "unlock-section"
            ? `Unlock "${dialog.section.title}"`
            : dialog?.kind === "lock-section"
              ? `Lock "${dialog.section.title}"`
              : dialog?.kind === "remove-lock-section"
                ? `Remove password from "${dialog.section.title}"`
                : dialog?.kind === "lock-notebook"
                  ? `Lock "${notebook.title}"`
                  : dialog?.kind === "remove-lock-notebook"
                    ? `Remove password from "${notebook.title}"`
                    : `Unlock "${notebook.title}"`
        }
        submitLabel={
          dialog?.kind?.startsWith("remove-lock")
            ? "Remove"
            : dialog?.kind?.startsWith("lock")
              ? "Lock"
              : "Unlock"
        }
        minLength={dialog?.kind?.startsWith("lock") && !dialog?.kind.startsWith("remove") ? 8 : undefined}
        onSubmit={async (password) => {
          try {
            if (dialog?.kind === "unlock-notebook") {
              await unlockNotebook(notebook.id, password);
              unlockStore.unlockNotebook(
                notebook.id,
                notebook.sections.filter((s) => s.isLocked).map((s) => s.id),
                password
              );
            } else if (dialog?.kind === "unlock-section") {
              await unlockSection(dialog.section.id, password);
              unlockStore.setSectionPassword(dialog.section.id, password);
              setExpanded((s) => new Set(s).add(dialog.section.id));
              if (dialog.thenOpen) {
                navigate(
                  `/notebooks/${notebookId}/sections/${dialog.section.id}/pages/${dialog.thenOpen.pageId}`
                );
              } else if (dialog.thenCreatePage) {
                const section = dialog.section;
                window.setTimeout(() => setDialog({ kind: "new-page", section }), 0);
              }
            } else if (dialog?.kind === "lock-notebook") {
              await lockNotebook(notebook.id, password);
              unlockStore.unlockNotebook(
                notebook.id,
                notebook.sections.map((s) => s.id),
                password
              );
              invalidate();
            } else if (dialog?.kind === "lock-section") {
              await lockSection(dialog.section.id, password);
              unlockStore.setSectionPassword(dialog.section.id, password);
              invalidate();
            } else if (dialog?.kind === "remove-lock-notebook") {
              await removeNotebookLock(notebook.id, password);
              unlockStore.relockNotebook(
                notebook.id,
                notebook.sections.map((s) => s.id)
              );
              invalidate();
            } else if (dialog?.kind === "remove-lock-section") {
              await removeSectionLock(dialog.section.id, password);
              unlockStore.relockSection(dialog.section.id);
              invalidate();
            }
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Something went wrong";
          }
        }}
      />

      <Dialog
        open={dialog?.kind === "new-section" || dialog?.kind === "new-page"}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setDraft("");
            createSec.reset();
            createPg.reset();
          }
        }}
      >
        <DialogContent
          title={
            dialog?.kind === "new-page"
              ? `New page in "${dialog.section.title}"`
              : "New section"
          }
        >
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Title"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !draft.trim()) return;
                if (dialog?.kind === "new-section") createSec.mutate(draft.trim());
                if (dialog?.kind === "new-page") createPg.mutate({ section: dialog.section, title: draft.trim() });
              }}
            />
            {createError && <p className="text-sm text-danger text-center">{createError}</p>}
            <Button
              className="w-full"
              disabled={!draft.trim() || createSec.isPending || createPg.isPending}
              onClick={() => {
                if (dialog?.kind === "new-section") createSec.mutate(draft.trim());
                if (dialog?.kind === "new-page") createPg.mutate({ section: dialog.section, title: draft.trim() });
              }}
            >
              {createSec.isPending || createPg.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent
          title={
            editTarget?.kind === "page"
              ? "Rename page"
              : editTarget?.kind === "section"
                ? "Rename section"
                : "Rename notebook"
          }
        >
          {editTarget && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Title"
                value={editTarget.title}
                onChange={(e) => setEditTarget({ ...editTarget, title: e.target.value })}
                className="text-center"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editTarget.title.trim()) rename.mutate();
                }}
              />
              {renameError && <p className="text-sm text-danger text-center">{renameError}</p>}
              <div className="flex gap-2">
                <Button className="flex-1" variant="ghost" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={!editTarget.title.trim() || rename.isPending}
                  onClick={() => rename.mutate()}
                >
                  {rename.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title="Delete notebook">
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              Delete “{notebook.title}”? All sections and pages inside will be permanently removed.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={removeNotebook.isPending}
                onClick={() => removeNotebook.mutate()}
              >
                <span className="text-danger">{removeNotebook.isPending ? "Deleting…" : "Delete"}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteSectionTarget !== null} onOpenChange={(o) => !o && setDeleteSectionTarget(null)}>
        <DialogContent title="Delete section">
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              Delete “{deleteSectionTarget?.title}”? All pages inside will be permanently removed.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setDeleteSectionTarget(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={removeSection.isPending}
                onClick={() => deleteSectionTarget && removeSection.mutate(deleteSectionTarget.id)}
              >
                <span className="text-danger">{removeSection.isPending ? "Deleting…" : "Delete"}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePageTarget !== null} onOpenChange={(o) => !o && setDeletePageTarget(null)}>
        <DialogContent title="Move to recycle bin?">
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              Move “{deletePageTarget?.title}” to the recycle bin? You can restore it within 7 days.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setDeletePageTarget(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={removePage.isPending}
                onClick={() => deletePageTarget && removePage.mutate(deletePageTarget.id)}
              >
                <span className="text-danger">{removePage.isPending ? "Moving…" : "Move"}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
