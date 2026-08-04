import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Book, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createNotebook,
  deleteNotebook,
  fetchNotebooks,
  lockNotebook,
  renameNotebook,
  unlockNotebook,
} from "../lib/api";
import type { Notebook } from "../lib/types";
import { useUnlockStore } from "../stores/unlock";
import { useUiStore } from "../stores/ui";
import { PasswordDialog } from "../components/PasswordDialog";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

export default function Notebooks() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveNotebook = useUiStore((s) => s.setActiveNotebook);
  const unlockedNotebooks = useUnlockStore((s) => s.unlockedNotebooks);
  const unlockStore = useUnlockStore();

  const { data: notebooks, isLoading } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [unlockNb, setUnlockNb] = useState<Notebook | null>(null);
  const [lockNb, setLockNb] = useState<Notebook | null>(null);
  const [deleteNb, setDeleteNb] = useState<Notebook | null>(null);
  const [editNb, setEditNb] = useState<{ id: string; title: string } | null>(null);

  const create = useMutation({
    mutationFn: () => createNotebook(title.trim()),
    onSuccess: (nb) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      setCreateOpen(false);
      setTitle("");
      setActiveNotebook(nb.id);
      navigate(`/notebooks/${nb.id}`);
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, title: next }: { id: string; title: string }) => renameNotebook(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      setEditNb(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: (_void, id) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      setDeleteNb(null);
      if (useUiStore.getState().activeNotebookId === id) setActiveNotebook(null);
    },
  });

  function openNotebook(nb: Notebook) {
    if (nb.isLocked && !unlockedNotebooks[nb.id]) {
      setUnlockNb(nb);
      return;
    }
    setActiveNotebook(nb.id);
    navigate(`/notebooks/${nb.id}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-7 py-10 animate-rise-in">
      <div className="text-center mb-8">
        <h1 className="text-xl font-medium">Notebooks</h1>
        <p className="text-sm text-secondary mt-1">Your shelves — open one to browse sections and pages.</p>
        <Button variant="accent" className="mt-4" onClick={() => setCreateOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} /> New notebook
          </span>
        </Button>
      </div>

      {isLoading && <p className="text-sm text-secondary text-center">Loading…</p>}

      {!isLoading && (notebooks ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border glass p-5 py-16 text-center shadow-card">
          <div className="h-12 w-12 rounded-2xl bg-accent-soft flex items-center justify-center">
            <Book size={20} className="text-accent" />
          </div>
          <p className="text-sm text-secondary">No notebooks yet.</p>
          <Button variant="accent" onClick={() => setCreateOpen(true)}>
            Create your first
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(notebooks ?? []).map((nb) => {
          const sealed = nb.isLocked && !unlockedNotebooks[nb.id];
          const pages = nb.sections.reduce((n, s) => n + s.pages.length, 0);
          return (
            <div
              key={nb.id}
              className="group relative rounded-xl border border-border glass p-5
                         hover:border-accent transition-colors shadow-card
                         flex flex-col items-center text-center min-h-[160px]"
            >
              {/* Main control first in tab order; actions follow. */}
              <button type="button" onClick={() => openNotebook(nb)} className="w-full flex flex-col items-center flex-1 justify-center">
                <div className="h-10 w-10 rounded-xl bg-accent-soft flex items-center justify-center">
                  {sealed ? (
                    <Lock size={16} className="text-secondary" />
                  ) : (
                    <Book size={16} className="text-accent" />
                  )}
                </div>
                <h2 className="mt-4 text-sm font-medium text-primary truncate w-full px-1">{nb.title}</h2>
                <p className="mt-1 text-xs text-secondary">
                  {sealed
                    ? "Sealed · encrypted"
                    : `${nb.sections.length} ${nb.sections.length === 1 ? "section" : "sections"} · ${pages} ${pages === 1 ? "page" : "pages"}`}
                </p>
              </button>
              <div className="row-actions absolute top-3 right-3 flex items-center gap-0.5">
                <button
                  type="button"
                  title="Rename"
                  className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-2"
                  onClick={() => setEditNb({ id: nb.id, title: nb.title })}
                >
                  <Pencil size={14} />
                </button>
                {!nb.isLocked && (
                  <button
                    type="button"
                    title="Lock notebook"
                    className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-2"
                    onClick={() => setLockNb(nb)}
                  >
                    <LockOpen size={14} />
                  </button>
                )}
                {nb.isLocked && unlockedNotebooks[nb.id] && (
                  <button
                    type="button"
                    title="Re-lock for this session"
                    className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-2"
                    onClick={() =>
                      unlockStore.relockNotebook(
                        nb.id,
                        nb.sections.map((s) => s.id)
                      )
                    }
                  >
                    <Lock size={14} />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete notebook"
                  className="p-1.5 rounded-md text-secondary hover:text-danger hover:bg-surface-2"
                  onClick={() => setDeleteNb(nb)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="New notebook">
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-center"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) create.mutate();
              }}
            />
            <Button className="w-full" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editNb !== null} onOpenChange={(o) => !o && setEditNb(null)}>
        <DialogContent title="Rename notebook">
          {editNb && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Title"
                value={editNb.title}
                onChange={(e) => setEditNb({ ...editNb, title: e.target.value })}
                className="text-center"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editNb.title.trim()) {
                    rename.mutate({ id: editNb.id, title: editNb.title.trim() });
                  }
                }}
              />
              <div className="flex gap-2">
                <Button className="flex-1" variant="ghost" onClick={() => setEditNb(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  variant="accent"
                  disabled={!editNb.title.trim() || rename.isPending}
                  onClick={() => rename.mutate({ id: editNb.id, title: editNb.title.trim() })}
                >
                  {rename.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteNb !== null} onOpenChange={(o) => !o && setDeleteNb(null)}>
        <DialogContent title="Delete notebook">
          <div className="space-y-3 text-center">
            <p className="text-sm text-secondary">
              Delete “{deleteNb?.title}”? All sections and pages inside will be permanently removed.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setDeleteNb(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={remove.isPending}
                onClick={() => deleteNb && remove.mutate(deleteNb.id)}
              >
                <span className="text-danger">{remove.isPending ? "Deleting…" : "Delete"}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PasswordDialog
        open={unlockNb !== null}
        onOpenChange={(o) => !o && setUnlockNb(null)}
        title={unlockNb ? `Unlock "${unlockNb.title}"` : "Unlock"}
        submitLabel="Unlock"
        onSubmit={async (password) => {
          if (!unlockNb) return null;
          try {
            await unlockNotebook(unlockNb.id, password);
            unlockStore.unlockNotebook(
              unlockNb.id,
              unlockNb.sections.filter((s) => s.isLocked).map((s) => s.id),
              password
            );
            setActiveNotebook(unlockNb.id);
            navigate(`/notebooks/${unlockNb.id}`);
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Wrong password";
          }
        }}
      />

      <PasswordDialog
        open={lockNb !== null}
        onOpenChange={(o) => !o && setLockNb(null)}
        title={lockNb ? `Lock "${lockNb.title}"` : "Lock"}
        submitLabel="Lock"
        minLength={8}
        onSubmit={async (password) => {
          if (!lockNb) return null;
          try {
            await lockNotebook(lockNb.id, password);
            unlockStore.unlockNotebook(
              lockNb.id,
              lockNb.sections.map((s) => s.id),
              password
            );
            queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Couldn't lock notebook";
          }
        }}
      />
    </div>
  );
}
