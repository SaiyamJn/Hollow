import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { GripVertical } from "lucide-react";
import type { QuickNote } from "../lib/types";

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Desktop rearrange — drag by the grip (or the card in arrange mode). Smooth slot transitions. */
export function SortableNotesSection({
  notes,
  enabled,
  className,
  renderCard,
  onReorder,
}: {
  notes: QuickNote[];
  enabled: boolean;
  className?: string;
  renderCard: (note: QuickNote, opts: { dragging: boolean }) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState(notes.map((n) => n.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragFrom = useRef(-1);

  useEffect(() => {
    if (!draggingId) setOrder(notes.map((n) => n.id));
  }, [notes, draggingId]);

  const byId = new Map(notes.map((n) => [n.id, n]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as QuickNote[];

  function onDragStart(id: string, index: number, e: React.DragEvent) {
    if (!enabled) {
      e.preventDefault();
      return;
    }
    dragFrom.current = index;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    // Slight delay so the browser captures a tidy drag image
    requestAnimationFrame(() => {
      const el = e.currentTarget as HTMLElement;
      el.style.opacity = "0.4";
    });
  }

  function onDragEnd(e: React.DragEvent) {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDraggingId(null);
    setOverId(null);
    onReorder(order);
  }

  function onDragOver(id: string, index: number, e: React.DragEvent) {
    if (!enabled || !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id === overId) return;
    setOverId(id);
    const from = order.indexOf(draggingId);
    if (from < 0 || from === index) return;
    setOrder((prev) => moveItem(prev, from, index));
  }

  return (
    <div className={clsx("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4", className)}>
      {ordered.map((note, index) => {
        const dragging = draggingId === note.id;
        return (
          <div
            key={note.id}
            draggable={enabled}
            onDragStart={(e) => onDragStart(note.id, index, e)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(note.id, index, e)}
            onDrop={(e) => e.preventDefault()}
            className={clsx(
              "relative group transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              dragging && "scale-[1.02] z-10",
              overId === note.id && draggingId && overId !== draggingId && "translate-y-1"
            )}
          >
            {enabled && (
              <div
                className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                           cursor-grab active:cursor-grabbing rounded-md p-1 text-secondary hover:text-primary hover:bg-surface-2/80"
                title="Drag to rearrange"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <GripVertical size={14} />
              </div>
            )}
            {renderCard(note, { dragging })}
          </div>
        );
      })}
    </div>
  );
}
