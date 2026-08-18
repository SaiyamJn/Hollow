import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Book, Calendar, CheckSquare, FileText, Plus } from "lucide-react";
import { createNotebook, openDailyNote } from "../lib/api";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

// Floating quick-create button (bottom right), mirroring the mobile FAB.
export function QuickCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notebookDialog, setNotebookDialog] = useState(false);
  const [notebookTitle, setNotebookTitle] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const daily = useMutation({
    mutationFn: openDailyNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      navigate(`/notebooks/${note.notebookId}/sections/${note.sectionId}/pages/${note.id}`);
    },
  });

  const newNotebook = useMutation({
    mutationFn: () => createNotebook(notebookTitle.trim()),
    onSuccess: (nb) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      setNotebookDialog(false);
      setNotebookTitle("");
      navigate(`/notebooks/${nb.id}`);
    },
  });

  const items = [
    { label: "Today's note", icon: Calendar, onClick: () => daily.mutate() },
    { label: "Quick note", icon: FileText, onClick: () => navigate("/quick-notes") },
    { label: "New task", icon: CheckSquare, onClick: () => navigate("/tasks") },
    { label: "New notebook", icon: Book, onClick: () => setNotebookDialog(true) },
  ];

  return (
    <>
      <div ref={menuRef} className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-2">
        {open && (
          <div className="glass-strong rounded-2xl border border-border shadow-pop p-1.5 animate-fade-in min-w-[180px]">
            {items.map(({ label, icon: Icon, onClick }) => (
              <button
                key={label}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-secondary
                           hover:text-primary hover:bg-accent-soft transition-colors"
                onClick={() => {
                  setOpen(false);
                  onClick();
                }}
              >
                <span className="icon-well h-7 w-7 rounded-lg">
                  <Icon size={14} />
                </span>
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          title="Create"
          className="rounded-full bg-accent text-surface-0 p-3.5 shadow-[0_6px_20px_color-mix(in_srgb,var(--accent)_35%,transparent)]
                     hover:opacity-95 hover:scale-105 transition-all ring-4 ring-accent-soft"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus size={18} className={open ? "rotate-45 transition-transform" : "transition-transform"} />
        </button>
      </div>

      <Dialog open={notebookDialog} onOpenChange={setNotebookDialog}>
        <DialogContent title="New notebook">
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Title"
              value={notebookTitle}
              onChange={(e) => setNotebookTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && notebookTitle.trim()) newNotebook.mutate();
              }}
            />
            <Button
              className="w-full"
              disabled={!notebookTitle.trim() || newNotebook.isPending}
              onClick={() => newNotebook.mutate()}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
