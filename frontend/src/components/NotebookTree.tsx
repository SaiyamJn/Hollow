import { KeyboardEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Lock, LockOpen, Plus, FileText } from "lucide-react";
import clsx from "clsx";
import {
  createNotebook,
  createPage,
  createSection,
  fetchNotebooks,
  lockNotebook,
  lockSection,
  unlockNotebook,
  unlockSection,
} from "../lib/api";
import type { Notebook, Section } from "../lib/types";
import { useUnlockStore } from "../stores/unlock";
import { PasswordDialog } from "./PasswordDialog";

type DialogState =
  | { kind: "unlock-notebook"; notebook: Notebook }
  | { kind: "unlock-section"; section: Section; navigateTo?: string }
  | { kind: "lock-notebook"; notebook: Notebook }
  | { kind: "lock-section"; section: Section }
  | null;

type CreatingState =
  | { type: "notebook" }
  | { type: "section"; notebookId: string }
  | { type: "page"; sectionId: string }
  | null;

function NewItemInput({ placeholder, onCreate }: { placeholder: string; onCreate: (title: string) => void }) {
  const [value, setValue] = useState("");
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) onCreate(value.trim());
    if (e.key === "Escape") onCreate("");
  }
  return (
    <input
      autoFocus
      className="w-full rounded-md glass-input border border-border px-2 py-1 text-sm text-primary
                 placeholder:text-secondary focus:outline-none focus:border-accent"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onCreate("")}
    />
  );
}

export function NotebookTree({ search }: { search: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pageId: activePageId } = useParams();
  const { sectionPasswords, unlockedNotebooks } = useUnlockStore();
  const unlockStore = useUnlockStore();

  const { data: notebooks, isLoading } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });

  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [creating, setCreating] = useState<CreatingState>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notebooks"] });

  function toggle(set: Set<string>, id: string, apply: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    apply(next);
  }

  // --- filtering (search expands everything and prunes non-matches) ---
  const visible = (notebooks ?? [])
    .map((nb) => {
      if (!search) return nb;
      if (nb.title.toLowerCase().includes(search)) return nb;
      const sections = nb.sections
        .map((sec) =>
          sec.title.toLowerCase().includes(search)
            ? sec
            : { ...sec, pages: sec.pages.filter((p) => p.title.toLowerCase().includes(search)) }
        )
        .filter((sec) => sec.title.toLowerCase().includes(search) || sec.pages.length > 0);
      return sections.length > 0 ? { ...nb, sections } : null;
    })
    .filter((nb): nb is Notebook => nb !== null);

  const isNotebookOpen = (id: string) => !!search || expandedNotebooks.has(id);
  const isSectionOpen = (id: string) => !!search || expandedSections.has(id);

  // --- click handlers ---
  function onNotebookClick(nb: Notebook) {
    if (nb.isLocked && !unlockedNotebooks[nb.id]) {
      setDialog({ kind: "unlock-notebook", notebook: nb });
      return;
    }
    toggle(expandedNotebooks, nb.id, setExpandedNotebooks);
  }

  function onSectionClick(sec: Section) {
    if (sec.isLocked && !sectionPasswords[sec.id]) {
      setDialog({ kind: "unlock-section", section: sec });
      return;
    }
    toggle(expandedSections, sec.id, setExpandedSections);
  }

  function pageRoute(notebookId: string, sectionId: string, pageId: string) {
    return `/notebooks/${notebookId}/sections/${sectionId}/pages/${pageId}`;
  }

  function onPageClick(sec: Section, pageId: string) {
    const route = pageRoute(sec.notebookId, sec.id, pageId);
    if (sec.isLocked && !sectionPasswords[sec.id]) {
      setDialog({ kind: "unlock-section", section: sec, navigateTo: route });
      return;
    }
    navigate(route);
  }

  // --- create handlers ---
  async function handleCreate(title: string) {
    const state = creating;
    setCreating(null);
    if (!title || !state) return;
    if (state.type === "notebook") {
      await createNotebook(title);
    } else if (state.type === "section") {
      const pw =
        unlockStore.notebookPasswords[state.notebookId] ??
        notebooks
          ?.find((nb) => nb.id === state.notebookId)
          ?.sections.map((s) => sectionPasswords[s.id])
          .find(Boolean);
      const sec = await createSection(state.notebookId, title, pw);
      if (pw && sec.isLocked) unlockStore.setSectionPassword(sec.id, pw);
      setExpandedSections((s) => new Set(s).add(sec.id));
    } else {
      const page = await createPage(state.sectionId, title, sectionPasswords[state.sectionId]);
      const sec = notebooks?.flatMap((nb) => nb.sections).find((s) => s.id === state.sectionId);
      if (sec) navigate(pageRoute(sec.notebookId, sec.id, page.id));
    }
    invalidate();
  }

  // --- dialog submit ---
  async function onDialogSubmit(password: string): Promise<string | null> {
    if (!dialog) return null;
    try {
      if (dialog.kind === "unlock-notebook") {
        await unlockNotebook(dialog.notebook.id, password);
        unlockStore.unlockNotebook(
          dialog.notebook.id,
          dialog.notebook.sections.filter((s) => s.isLocked).map((s) => s.id),
          password
        );
        setExpandedNotebooks((s) => new Set(s).add(dialog.notebook.id));
      } else if (dialog.kind === "unlock-section") {
        await unlockSection(dialog.section.id, password);
        unlockStore.setSectionPassword(dialog.section.id, password);
        setExpandedSections((s) => new Set(s).add(dialog.section.id));
        if (dialog.navigateTo) navigate(dialog.navigateTo);
      } else if (dialog.kind === "lock-notebook") {
        await lockNotebook(dialog.notebook.id, password);
        // keep access for the rest of this session
        unlockStore.unlockNotebook(dialog.notebook.id, dialog.notebook.sections.map((s) => s.id), password);
        invalidate();
      } else {
        await lockSection(dialog.section.id, password);
        unlockStore.setSectionPassword(dialog.section.id, password);
        invalidate();
      }
      return null;
    } catch (err: any) {
      return err.response?.data?.error ?? "Something went wrong";
    }
  }

  if (isLoading) return <p className="px-2 py-1 text-sm text-secondary">Loading…</p>;

  return (
    <div className="space-y-0.5">
      {visible.map((nb) => {
        const nbSealed = nb.isLocked && !unlockedNotebooks[nb.id];
        return (
        <div key={nb.id}>
          {/* notebook row */}
          <div className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-surface-2 cursor-pointer">
            <button className="flex items-center gap-1.5 flex-1 min-w-0 text-left" onClick={() => onNotebookClick(nb)}>
              {isNotebookOpen(nb.id) ? (
                <ChevronDown size={14} className="shrink-0 text-secondary" />
              ) : (
                <ChevronRight size={14} className="shrink-0 text-secondary" />
              )}
              <span className={clsx("text-sm font-medium truncate", nbSealed && "text-secondary")}>{nb.title}</span>
              {nb.isLocked && (
                <span className="shrink-0" title={nbSealed ? "Encrypted" : "Encrypted · unlocked this session"}>
                  {nbSealed ? (
                    <Lock size={12} className="text-secondary" />
                  ) : (
                    <LockOpen size={12} className="text-accent animate-unlock-pop" />
                  )}
                </span>
              )}
            </button>
            {!nb.isLocked && (
              <button
                title="Lock notebook"
                className="row-actions p-1 rounded-md text-secondary hover:text-primary"
                onClick={() => setDialog({ kind: "lock-notebook", notebook: nb })}
              >
                <LockOpen size={13} />
              </button>
            )}
            {nb.isLocked && unlockedNotebooks[nb.id] && (
              <button
                title="Re-lock for this session"
                className="row-actions p-1 rounded-md text-secondary hover:text-primary"
                onClick={() =>
                  unlockStore.relockNotebook(nb.id, nb.sections.map((s) => s.id))
                }
              >
                <Lock size={13} />
              </button>
            )}
          </div>

          {isNotebookOpen(nb.id) && (
            <div className="ml-4 border-l border-border pl-2 space-y-0.5">
              {nb.sections.map((sec) => {
                const secSealed = sec.isLocked && !sectionPasswords[sec.id];
                return (
                <div key={sec.id}>
                  {/* section row */}
                  <div className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-surface-2 cursor-pointer">
                    <button
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                      onClick={() => onSectionClick(sec)}
                    >
                      {isSectionOpen(sec.id) ? (
                        <ChevronDown size={14} className="shrink-0 text-secondary" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0 text-secondary" />
                      )}
                      <span className={clsx("text-sm truncate", secSealed && "text-secondary")}>{sec.title}</span>
                      {sec.isLocked && (
                        <span className="shrink-0" title={secSealed ? "Encrypted" : "Encrypted · unlocked this session"}>
                          {secSealed ? (
                            <Lock size={12} className="text-secondary" />
                          ) : (
                            <LockOpen size={12} className="text-accent animate-unlock-pop" />
                          )}
                        </span>
                      )}
                    </button>
                    {!sec.isLocked && (
                      <button
                        title="Lock section"
                        className="row-actions p-1 rounded-md text-secondary hover:text-primary"
                        onClick={() => setDialog({ kind: "lock-section", section: sec })}
                      >
                        <LockOpen size={13} />
                      </button>
                    )}
                    {sec.isLocked && sectionPasswords[sec.id] && (
                      <button
                        title="Re-lock for this session"
                        className="row-actions p-1 rounded-md text-secondary hover:text-primary"
                        onClick={() => unlockStore.relockSection(sec.id)}
                      >
                        <Lock size={13} />
                      </button>
                    )}
                  </div>

                  {isSectionOpen(sec.id) && (
                    <div className="ml-4 border-l border-border pl-2 space-y-0.5">
                      {sec.pages.map((page) => (
                        <button
                          key={page.id}
                          onClick={() => onPageClick(sec, page.id)}
                          className={clsx(
                            "w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm truncate",
                            page.id === activePageId
                              ? "text-accent bg-accent-soft"
                              : "text-secondary hover:text-primary hover:bg-surface-2"
                          )}
                        >
                          <FileText size={13} className="shrink-0" />
                          <span className="truncate">{page.title}</span>
                        </button>
                      ))}
                      {creating?.type === "page" && creating.sectionId === sec.id ? (
                        <NewItemInput placeholder="Page title" onCreate={handleCreate} />
                      ) : (
                        <button
                          className="w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-secondary hover:text-primary"
                          onClick={() => {
                            if (sec.isLocked && !sectionPasswords[sec.id]) {
                              setDialog({ kind: "unlock-section", section: sec });
                            } else {
                              setCreating({ type: "page", sectionId: sec.id });
                            }
                          }}
                        >
                          <Plus size={13} /> New page
                        </button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
              {creating?.type === "section" && creating.notebookId === nb.id ? (
                <NewItemInput placeholder="Section title" onCreate={handleCreate} />
              ) : (
                <button
                  className="w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-secondary hover:text-primary"
                  onClick={() => setCreating({ type: "section", notebookId: nb.id })}
                >
                  <Plus size={13} /> New section
                </button>
              )}
            </div>
          )}
        </div>
        );
      })}

      {creating?.type === "notebook" ? (
        <NewItemInput placeholder="Notebook title" onCreate={handleCreate} />
      ) : (
        <button
          className="w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-secondary hover:text-primary"
          onClick={() => setCreating({ type: "notebook" })}
        >
          <Plus size={13} /> New notebook
        </button>
      )}

      <PasswordDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={
          dialog?.kind === "unlock-notebook"
            ? `Unlock "${dialog.notebook.title}"`
            : dialog?.kind === "unlock-section"
              ? `Unlock "${dialog.section.title}"`
              : dialog?.kind === "lock-notebook"
                ? `Lock "${dialog.notebook.title}"`
                : dialog?.kind === "lock-section"
                  ? `Lock "${dialog.section.title}"`
                  : ""
        }
        submitLabel={dialog?.kind.startsWith("lock") ? "Lock" : "Unlock"}
        minLength={dialog?.kind.startsWith("lock") ? 8 : undefined}
        onSubmit={onDialogSubmit}
      />
    </div>
  );
}
