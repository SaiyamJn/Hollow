import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Book, ChevronRight, Lock, Plus } from "lucide-react";
import { createNotebook, fetchNotebooks, unlockNotebook } from "../lib/api";
import type { Notebook } from "../lib/types";
import { useUnlockStore } from "../stores/unlock";
import { useUiStore } from "../stores/ui";
import { PasswordDialog } from "../components/PasswordDialog";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

// Dedicated notebooks landing — separate from the Home dashboard.
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
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-medium">Notebooks</h1>
          <p className="text-sm text-secondary mt-1">
            Your shelves — open one to browse sections and pages.
          </p>
        </div>
        <Button variant="accent" onClick={() => setCreateOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} /> New notebook
          </span>
        </Button>
      </div>

      {isLoading && <p className="text-sm text-secondary">Loading…</p>}

      {!isLoading && (notebooks ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16">
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
            <button
              key={nb.id}
              type="button"
              onClick={() => openNotebook(nb)}
              className="group text-left rounded-2xl border border-border bg-surface-1 p-5
                         hover:border-accent transition-colors shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent-soft flex items-center justify-center">
                  {sealed ? (
                    <Lock size={16} className="text-secondary" />
                  ) : (
                    <Book size={16} className="text-accent" />
                  )}
                </div>
                <ChevronRight
                  size={16}
                  className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity mt-1"
                />
              </div>
              <h2 className="mt-4 text-sm font-medium truncate">{nb.title}</h2>
              <p className="mt-1 text-xs text-secondary">
                {sealed
                  ? "Sealed · encrypted"
                  : `${nb.sections.length} ${nb.sections.length === 1 ? "section" : "sections"} · ${pages} ${pages === 1 ? "page" : "pages"}`}
              </p>
            </button>
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) create.mutate();
              }}
            />
            <Button
              className="w-full"
              disabled={!title.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Create
            </Button>
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
    </div>
  );
}
