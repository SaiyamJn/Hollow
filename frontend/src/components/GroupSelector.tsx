import { useEffect, useState, KeyboardEvent } from "react";
import clsx from "clsx";
import { Check, GripVertical, Pencil, Plus, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

export function GroupSelector({
  value,
  onChange,
  availableGroups,
  defaultGroup,
}: {
  value: string;
  onChange: (val: string) => void;
  availableGroups: string[];
  defaultGroup?: string;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <div className="flex items-center justify-between text-xs text-secondary">
        <span className="font-medium uppercase tracking-wide text-[10px]">
          Group / Class {defaultGroup && !value && <span className="opacity-60 lowercase font-normal">(default: {defaultGroup})</span>}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="hover:text-primary transition-colors text-[11px]"
          >
            Clear
          </button>
        )}
      </div>
      <Input
        placeholder={defaultGroup ? `Class (default: ${defaultGroup})` : "Group / Class (e.g. Work, Personal)"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs"
      />
      {availableGroups.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {availableGroups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange(value === g ? "" : g)}
              className={clsx(
                "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1",
                value === g
                  ? "bg-accent-soft text-accent"
                  : "bg-surface-2/60 text-secondary hover:text-primary hover:bg-surface-2"
              )}
            >
              <span>{g}</span>
              {g === defaultGroup && <span className="w-1 h-1 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupFilterBar({
  groups,
  selected,
  onSelect,
  onManage,
  defaultGroup,
  className,
}: {
  groups: string[];
  selected: string;
  onSelect: (group: string) => void;
  onManage?: () => void;
  defaultGroup?: string;
  className?: string;
}) {
  if (groups.length === 0 && !onManage) return null;

  return (
    <div className={clsx("flex items-center justify-center gap-1.5 flex-wrap", className)}>
      {["All", ...groups].map((g) => {
        const isDef = g !== "All" && g === defaultGroup;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onSelect(g)}
            className={clsx(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1",
              selected === g
                ? "bg-accent-soft text-accent font-semibold shadow-xs"
                : "bg-surface-2/60 text-secondary hover:text-primary hover:bg-surface-2"
            )}
          >
            <span>{g}</span>
            {isDef && <span className="w-1.5 h-1.5 rounded-full bg-accent/70" title="Default class" />}
          </button>
        );
      })}
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          title="Manage classes (rearrange, edit, delete, default)"
          className="px-2.5 py-1 rounded-full text-xs font-medium text-secondary hover:text-primary bg-surface-2/40 hover:bg-surface-2 transition-colors flex items-center gap-1"
        >
          <SlidersHorizontal size={12} />
          <span>Classes</span>
        </button>
      )}
    </div>
  );
}

export function ManageClassesDialog({
  open,
  onOpenChange,
  classes,
  defaultClass,
  onSaveOrder,
  onRenameClass,
  onDeleteClass,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: string[];
  defaultClass: string;
  onSaveOrder: (classes: string[], defaultClass?: string) => Promise<any> | any;
  onRenameClass: (oldName: string, newName: string) => Promise<any> | any;
  onDeleteClass: (name: string) => Promise<any> | any;
}) {
  const [currentClasses, setCurrentClasses] = useState<string[]>(classes);
  const [curDefault, setCurDefault] = useState<string>(defaultClass);
  const [newClassName, setNewClassName] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrentClasses(classes);
    setCurDefault(defaultClass);
  }, [classes, defaultClass, open]);

  async function toggleDefault(name: string) {
    const next = curDefault === name ? "" : name;
    setCurDefault(next);
    try {
      await onSaveOrder(currentClasses, next);
    } catch {}
  }

  async function handleAdd() {
    const trimmed = newClassName.trim();
    if (!trimmed) return;
    if (currentClasses.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewClassName("");
      return;
    }
    const next = [...currentClasses, trimmed];
    setCurrentClasses(next);
    setNewClassName("");
    try {
      await onSaveOrder(next, curDefault);
    } catch {}
  }

  async function handleRename(oldName: string) {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingIndex(null);
      return;
    }
    setBusy(true);
    try {
      await onRenameClass(oldName, trimmed);
      const next = currentClasses.map((c) => (c === oldName ? trimmed : c));
      setCurrentClasses(next);
      if (curDefault === oldName) setCurDefault(trimmed);
      setEditingIndex(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(name: string) {
    setBusy(true);
    try {
      await onDeleteClass(name);
      const next = currentClasses.filter((c) => c !== name);
      setCurrentClasses(next);
      if (curDefault === name) setCurDefault("");
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Manage Classes" className="max-w-md">
        <div className="space-y-4">
          <p className="text-xs text-secondary text-center -mt-2">
            Drag to rearrange order · Edit names, delete classes, or choose default.
          </p>

          {/* Delete confirmation banner if active */}
          {confirmDelete && (
            <div className="rounded-xl p-3 bg-danger/10 border border-danger/20 text-xs space-y-2">
              <p className="font-medium text-danger">
                Remove class &ldquo;{confirmDelete}&rdquo;?
              </p>
              <p className="text-secondary">
                Tasks in this class won&apos;t be deleted, but will have their class cleared.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="ghost"
                  className="flex-1 text-xs h-7 py-0"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 text-xs h-7 py-0 bg-danger text-white hover:bg-danger/90"
                  disabled={busy}
                  onClick={() => handleDelete(confirmDelete)}
                >
                  {busy ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          )}

          {/* Class List */}
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {currentClasses.length === 0 ? (
              <p className="text-xs text-secondary text-center py-6">
                No classes created yet. Add one below to get started.
              </p>
            ) : (
              currentClasses.map((cls, idx) => {
                const isDef = curDefault === cls;
                const isEditing = editingIndex === idx;

                return (
                  <div
                    key={cls}
                    draggable={!isEditing}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(idx));
                      setDragSourceIdx(idx);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverIdx !== idx) setDragOverIdx(idx);
                    }}
                    onDragLeave={() => {
                      if (dragOverIdx === idx) setDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragSourceIdx !== null && dragSourceIdx !== idx) {
                        const next = [...currentClasses];
                        const [moved] = next.splice(dragSourceIdx, 1);
                        next.splice(idx, 0, moved);
                        setCurrentClasses(next);
                        void onSaveOrder(next, curDefault);
                      }
                      setDragSourceIdx(null);
                      setDragOverIdx(null);
                    }}
                    className={clsx(
                      "flex items-center gap-2 p-2 rounded-xl bg-surface-2/40 hover:bg-surface-2/70 transition-colors group cursor-grab active:cursor-grabbing",
                      dragOverIdx === idx && "ring-2 ring-accent bg-accent-soft/20",
                      dragSourceIdx === idx && "opacity-40"
                    )}
                  >
                    {/* Drag grip handle */}
                    <div
                      className="text-secondary/40 group-hover:text-secondary shrink-0 cursor-grab active:cursor-grabbing p-0.5"
                      title="Drag to rearrange"
                    >
                      <GripVertical size={14} />
                    </div>

                    {/* Class name or edit field */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            autoFocus
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename(cls);
                              if (e.key === "Escape") setEditingIndex(null);
                            }}
                            className="text-xs py-1 h-7"
                          />
                          <button
                            type="button"
                            onClick={() => handleRename(cls)}
                            disabled={busy}
                            className="p-1 rounded text-accent hover:bg-accent-soft"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIndex(null)}
                            className="p-1 rounded text-secondary hover:text-primary"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium truncate">{cls}</span>
                          {isDef && (
                            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded-full bg-accent-soft text-accent">
                              Default
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Actions: default star, rename, delete */}
                    {!isEditing && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleDefault(cls)}
                          title={isDef ? "Default class (click to unset)" : "Set as default for new tasks"}
                          className={clsx(
                            "p-1.5 rounded-lg transition-colors",
                            isDef ? "text-accent" : "text-secondary hover:text-primary hover:bg-surface-2"
                          )}
                        >
                          <Star size={13} fill={isDef ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingIndex(idx);
                            setEditingValue(cls);
                          }}
                          title="Rename class"
                          className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(cls)}
                          title="Delete class"
                          className="p-1.5 rounded-lg text-secondary hover:text-danger hover:bg-surface-2 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Add class row */}
          <div className="pt-2 border-t border-border/20">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add new class name…"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                className="text-xs h-8"
              />
              <Button
                variant="accent"
                className="h-8 text-xs shrink-0 px-3 py-0"
                onClick={handleAdd}
                disabled={!newClassName.trim()}
              >
                <Plus size={13} className="mr-1" />
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" className="h-8 text-xs py-0 px-3" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
