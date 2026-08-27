import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { GripVertical } from "lucide-react";

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Vertical drag-to-reorder list (sections, pages, etc.). */
export function SortableVerticalList<T extends { id: string }>({
  items,
  enabled,
  className,
  renderItem,
  onReorder,
}: {
  items: T[];
  enabled: boolean;
  className?: string;
  renderItem: (item: T, opts: { dragging: boolean; grip?: React.ReactNode; moveUp?: () => void; moveDown?: () => void; isFirst?: boolean; isLast?: boolean }) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragFrom = useRef(-1);

  useEffect(() => {
    if (!draggingId) setOrder(items.map((i) => i.id));
  }, [items, draggingId]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as T[];

  function onDragStart(id: string, index: number, e: React.DragEvent) {
    if (!enabled) {
      e.preventDefault();
      return;
    }
    dragFrom.current = index;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    requestAnimationFrame(() => {
      (e.currentTarget as HTMLElement).style.opacity = "0.45";
    });
  }

  function onDragEnd(e: React.DragEvent) {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    const next = order.slice();
    const changed = next.length !== items.length || next.some((id, i) => id !== items[i]?.id);
    setDraggingId(null);
    if (changed) onReorder(next);
  }

  function onDragOver(_targetId: string, index: number, e: React.DragEvent) {
    if (!enabled || !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const from = order.indexOf(draggingId);
    if (from < 0 || from === index) return;
    setOrder((prev) => moveItem(prev, from, index));
  }

  return (
    <div className={clsx("space-y-0.5", className)}>
      {ordered.map((item, index) => {
        const dragging = draggingId === item.id;
        const isFirst = index === 0;
        const isLast = index === ordered.length - 1;
        
        const moveUp = enabled && !isFirst ? () => {
          const next = moveItem(order.slice(), index, index - 1);
          setOrder(next);
          onReorder(next);
        } : undefined;
        
        const moveDown = enabled && !isLast ? () => {
          const next = moveItem(order.slice(), index, index + 1);
          setOrder(next);
          onReorder(next);
        } : undefined;

        const grip = enabled ? (
          <div
            className="cursor-grab active:cursor-grabbing rounded-md p-1 text-secondary hover:text-primary hover:bg-surface-2/80 shrink-0"
            title="Drag to rearrange"
            draggable
            onDragStart={(e) => onDragStart(item.id, index, e)}
            onDragEnd={onDragEnd}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </div>
        ) : undefined;

        return (
          <div
            key={item.id}
            draggable={enabled}
            onDragStart={(e) => onDragStart(item.id, index, e)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(item.id, index, e)}
            onDrop={(e) => e.preventDefault()}
            className={clsx(
              "transition-transform duration-200",
              dragging && "opacity-60 scale-[1.01] z-10"
            )}
          >
            {renderItem(item, { dragging, grip, moveUp, moveDown, isFirst, isLast })}
          </div>
        );
      })}
    </div>
  );
}
