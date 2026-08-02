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
  Pencil,
  Plus,
  Trash2,
  Waypoints,
} from "lucide-react";
import {
  createPage,
  createSection,
  deleteNotebook,
  fetchNotebooks,
  renameNotebook,
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

type DialogKind =
  | { kind: "unlock-notebook" }
  | { kind: "unlock-section"; section: Section; thenOpen?: { pageId: string; title: string } }
  | { kind: "new-section" }
  | { kind: "new-page"; section: Section }
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
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");

  useEffect(() => {
    if (notebookId) setActiveNotebook(notebookId);
  }, [notebookId, setActiveNotebook]);

  useEffect(() => {
    if (notebook?.isLocked && !unlockedNotebooks[notebook.id]) {
      setDialog({ kind: "unlock-notebook" });
    }
  }, [notebook, unlockedNotebooks]);

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
      // New section under a locked notebook is created already locked — keep the password.
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
      navigate(`/notebooks/${notebookId}/sections/${vars.section.id}/pages/${page.id}`);
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

  const rename = useMutation({
    mutationFn: (title: string) => renameNotebook(notebookId!, title),
    onSuccess: () => {
      invalidate();
      setRenameOpen(false);
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

  return (
    <div className="max-w-2xl mx-auto px-7 py-10 animate-rise-in">
      <Link
        to="/notebooks"
        className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-accent mb-5"
      >
        <ArrowLeft size={12} /> All notebooks
      </Link>

      <div className="flex flex-col items-center text-center gap-4 mb-6">
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
            title="Rename"
            onClick={() => {
              setRenameTitle(notebook.title);
              setRenameOpen(true);
            }}
          >
            <Pencil size={14} />
          </Button>
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
              No sections yet — add one to start writing.
            </p>
          )}
          {notebook.sections.map((sec) => {
            const secSealed = sec.isLocked && !sectionPasswords[sec.id];
            const open = expanded.has(sec.id) && !secSealed;
            return (
              <div key={sec.id} className="rounded-xl border border-border glass overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-surface-2 transition-colors"
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

                {open && (
                  <div className="border-t border-border px-3.5 py-2 space-y-0.5">
                    {sec.pages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-secondary
                                   hover:text-primary hover:bg-surface-2 transition-colors text-left"
                        onClick={() => openPage(sec, page.id, page.title)}
                      >
                        <FileText size={13} className="shrink-0" />
                        <span className="truncate flex-1">{page.title}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-secondary
                                 hover:text-accent transition-colors"
                      onClick={() => setDialog({ kind: "new-page", section: sec })}
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
        open={dialog?.kind === "unlock-notebook" || dialog?.kind === "unlock-section"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={
          dialog?.kind === "unlock-section"
            ? `Unlock "${dialog.section.title}"`
            : `Unlock "${notebook.title}"`
        }
        submitLabel="Unlock"
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
              }
            }
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Wrong password";
          }
        }}
      />

      <Dialog
        open={dialog?.kind === "new-section" || dialog?.kind === "new-page"}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setDraft("");
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
            <Button
              className="w-full"
              disabled={
                !draft.trim() || createSec.isPending || createPg.isPending
              }
              onClick={() => {
                if (dialog?.kind === "new-section") createSec.mutate(draft.trim());
                if (dialog?.kind === "new-page") createPg.mutate({ section: dialog.section, title: draft.trim() });
              }}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent title="Rename notebook">
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              className="text-center"
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameTitle.trim()) rename.mutate(renameTitle.trim());
              }}
            />
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                variant="accent"
                disabled={!renameTitle.trim() || rename.isPending}
                onClick={() => rename.mutate(renameTitle.trim())}
              >
                {rename.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
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
    </div>
  );
}
