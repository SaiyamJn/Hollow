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

/** Vertical drag-to-reorder list with both desktop mouse DnD and mobile touch hold-to-drag. */
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
  renderItem: (
    item: T,
    opts: {
      dragging: boolean;
      grip?: React.ReactNode;
      moveUp?: () => void;
      moveDown?: () => void;
      isFirst?: boolean;
      isLast?: boolean;
    }
  ) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragFrom = useRef(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Touch hold-and-drag refs
  const longPressTimer = useRef<number | null>(null);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDraggingId = useRef<string | null>(null);
  const justDraggedRef = useRef(false);
  const currentOrderRef = useRef(order);
  currentOrderRef.current = order;

  useEffect(() => {
    if (!draggingId) setOrder(items.map((i) => i.id));
  }, [items, draggingId]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as T[];

  // ── Desktop HTML5 DnD ───────────────────────────────────────────────────────
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

  // ── Mobile Touch Hold-to-Drag ───────────────────────────────────────────────
  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function onTouchStart(id: string, e: React.TouchEvent) {
    clearLongPress();
    const touch = e.touches[0];
    if (!touch) return;
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    longPressTimer.current = window.setTimeout(() => {
      touchDraggingId.current = id;
      setDraggingId(id);
      if ("vibrate" in navigator) {
        try {
          navigator.vibrate(35);
        } catch {
          // ignore
        }
      }
    }, 320);
  }

  function onTouchMove(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;

    if (!touchDraggingId.current) {
      // If moving before the long-press fires, cancel hold (user is scrolling)
      const dist = Math.hypot(
        touch.clientX - touchStartPos.current.x,
        touch.clientY - touchStartPos.current.y
      );
      if (dist > 8) clearLongPress();
      return;
    }

    // Drag is active — prevent browser page scrolling
    if (e.cancelable) e.preventDefault();

    const activeId = touchDraggingId.current;
    const clientY = touch.clientY;

    // Find which item slot the finger is over
    let targetIndex = -1;
    let minDistance = Infinity;

    currentOrderRef.current.forEach((itemId, idx) => {
      const el = itemRefs.current.get(itemId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - midY);

      if (dist < minDistance) {
        minDistance = dist;
        targetIndex = idx;
      }
    });

    const currentIndex = currentOrderRef.current.indexOf(activeId);
    if (targetIndex >= 0 && targetIndex !== currentIndex && minDistance < 70) {
      const next = moveItem(currentOrderRef.current, currentIndex, targetIndex);
      setOrder(next);
      if ("vibrate" in navigator) {
        try {
          navigator.vibrate(20);
        } catch {
          // ignore
        }
      }
    }
  }

  function onTouchEnd() {
    clearLongPress();
    if (touchDraggingId.current) {
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 350);

      const finalOrder = currentOrderRef.current.slice();
      const changed =
        finalOrder.length !== items.length ||
        finalOrder.some((id, i) => id !== items[i]?.id);

      touchDraggingId.current = null;
      setDraggingId(null);

      if (changed) {
        if ("vibrate" in navigator) {
          try {
            navigator.vibrate([15, 30, 20]);
          } catch {
            // ignore
          }
        }
        onReorder(finalOrder);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={clsx("space-y-0.5", className)}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClickCapture={(e) => {
        // Prevent click events immediately following a touch drag drop
        if (justDraggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {ordered.map((item, index) => {
        const dragging = draggingId === item.id;
        const isFirst = index === 0;
        const isLast = index === ordered.length - 1;

        const moveUp =
          enabled && !isFirst
            ? () => {
                const next = moveItem(order.slice(), index, index - 1);
                setOrder(next);
                onReorder(next);
              }
            : undefined;

        const moveDown =
          enabled && !isLast
            ? () => {
                const next = moveItem(order.slice(), index, index + 1);
                setOrder(next);
                onReorder(next);
              }
            : undefined;

        const grip = enabled ? (
          <div
            className="cursor-grab active:cursor-grabbing rounded-md p-1 text-secondary/40 hover:text-primary hover:bg-surface-2/80 shrink-0 touch-none transition-colors"
            title="Drag to rearrange"
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              onDragStart(item.id, index, e);
            }}
            onDragEnd={onDragEnd}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => onTouchStart(item.id, e)}
          >
            <GripVertical size={14} />
          </div>
        ) : undefined;

        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            onDragOver={(e) => onDragOver(item.id, index, e)}
            onDrop={(e) => e.preventDefault()}
            className={clsx(
              "transition-transform duration-150 ease-out",
              dragging &&
                "opacity-60 scale-[1.01] shadow-pop border border-accent/40 bg-surface-1/90 rounded-xl z-20"
            )}
          >
            {renderItem(item, { dragging, grip, moveUp, moveDown, isFirst, isLast })}
          </div>
        );
      })}
    </div>
  );
}
