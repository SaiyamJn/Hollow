import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  View,
  type GestureResponderEvent,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { QuickNote } from "../lib/types";
import { animateReorder } from "../lib/motion";

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const ROW_ESTIMATE = 88;

type Slot = {
  id: string;
  index: number;
  col: number;
  top: number;
  left: number;
  height: number;
};

function buildSlots(
  ids: string[],
  heights: Map<string, number>,
  columns: number,
  columnWidth: number,
  gap: number
): Slot[] {
  const colY = Array.from({ length: columns }, () => 0);
  return ids.map((id, index) => {
    const col = index % columns;
    const height = heights.get(id) ?? ROW_ESTIMATE;
    const top = colY[col];
    const left = col * (columnWidth + gap);
    colY[col] += height + gap;
    return { id, index, col, top, left, height };
  });
}

function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Long-press + drag reorder in a masonry (multi-column) layout.
 * Order is linear; cards alternate across columns (0→left, 1→right, …).
 */
export function ReorderableNoteList({
  notes,
  enabled,
  columns = 2,
  columnWidth,
  gap = 10,
  renderCard,
  onReorder,
}: {
  notes: QuickNote[];
  enabled: boolean;
  columns?: number;
  columnWidth: number;
  gap?: number;
  renderCard: (
    note: QuickNote,
    opts: {
      dragging: boolean;
      arranging: boolean;
      /** Call from the card's onLongPress to start a drag (page coords). */
      startDrag?: (pageX: number, pageY: number) => void;
    }
  ) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState(notes.map((n) => n.id));
  const orderRef = useRef(order);
  const initialOrderRef = useRef(order);
  const heights = useRef<Map<string, number>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const startPageX = useRef(0);
  const startPageY = useRef(0);
  const ghostOrigin = useRef({ left: 0, top: 0 });
  const lastHover = useRef(-1);
  const containerX = useRef(0);
  const containerY = useRef(0);
  const containerRef = useRef<View>(null);
  const slotsRef = useRef<Slot[]>([]);

  useEffect(() => {
    const ids = notes.map((n) => n.id);
    if (!draggingIdRef.current) {
      setOrder(ids);
      orderRef.current = ids;
    }
  }, [notes]);

  function measureContainer() {
    containerRef.current?.measureInWindow((x, y) => {
      containerX.current = x;
      containerY.current = y;
    });
  }

  function refreshSlots() {
    slotsRef.current = buildSlots(orderRef.current, heights.current, columns, columnWidth, gap);
  }

  function beginDrag(id: string, pageX: number, pageY: number) {
    if (!enabled || draggingIdRef.current) return;
    measureContainer();
    refreshSlots();
    const slot = slotsRef.current.find((s) => s.id === id);
    ghostOrigin.current = { left: slot?.left ?? 0, top: slot?.top ?? 0 };
    startPageX.current = pageX;
    startPageY.current = pageY;
    dragX.setValue(0);
    dragY.setValue(0);
    lastHover.current = orderRef.current.indexOf(id);
    initialOrderRef.current = orderRef.current.slice();
    draggingIdRef.current = id;
    setDraggingId(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(dragScale, { toValue: 1.04, useNativeDriver: true, friction: 7, tension: 100 }).start();
  }

  function indexFromPoint(pageX: number, pageY: number): number {
    const localX = pageX - containerX.current;
    const localY = pageY - containerY.current;
    const ids = orderRef.current;
    if (!ids.length) return 0;

    const col = Math.max(0, Math.min(columns - 1, Math.floor(localX / (columnWidth + gap))));
    const inCol = slotsRef.current.filter((s) => s.col === col);
    if (inCol.length === 0) {
      const last = slotsRef.current[slotsRef.current.length - 1];
      return last ? last.index : 0;
    }

    let best = inCol[0];
    let bestDist = Infinity;
    for (const s of inCol) {
      const mid = s.top + s.height / 2;
      const d = Math.abs(localY - mid);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best.index;
  }

  function applyHover(to: number) {
    const id = draggingIdRef.current;
    if (!id || to === lastHover.current) return;
    const from = orderRef.current.indexOf(id);
    if (from < 0 || from === to) {
      lastHover.current = to;
      return;
    }
    lastHover.current = to;
    animateReorder();
    const next = moveItem(orderRef.current, from, to);
    orderRef.current = next;
    setOrder(next);
    void Haptics.selectionAsync();
  }

  function finishDrag() {
    if (!draggingIdRef.current) return;
    Animated.parallel([
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }),
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }),
      Animated.spring(dragScale, { toValue: 1, useNativeDriver: true, friction: 8 }),
    ]).start();
    const ids = orderRef.current.slice();
    const changed = !sameOrder(ids, initialOrderRef.current);
    draggingIdRef.current = null;
    setDraggingId(null);
    lastHover.current = -1;
    if (changed) onReorder(ids);
  }

  const pan = useRef(
    PanResponder.create({
      // Capture moves once a drag is active so the same finger keeps controlling the ghost.
      onStartShouldSetPanResponder: () => !!draggingIdRef.current,
      onStartShouldSetPanResponderCapture: () => !!draggingIdRef.current,
      onMoveShouldSetPanResponder: () => !!draggingIdRef.current,
      onMoveShouldSetPanResponderCapture: () => !!draggingIdRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (e: GestureResponderEvent) => {
        if (!draggingIdRef.current) return;
        const { pageX, pageY } = e.nativeEvent;
        dragX.setValue(pageX - startPageX.current);
        dragY.setValue(pageY - startPageY.current);
        refreshSlots();
        applyHover(indexFromPoint(pageX, pageY));
      },
      onPanResponderRelease: () => finishDrag(),
      onPanResponderTerminate: () => finishDrag(),
    })
  ).current;

  const byId = new Map(notes.map((n) => [n.id, n]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as QuickNote[];
  const arranging = !!draggingId;
  const slots = buildSlots(order, heights.current, columns, columnWidth, gap);
  slotsRef.current = slots;

  const totalWidth = columns * columnWidth + (columns - 1) * gap;
  const colHeights = Array.from({ length: columns }, () => 0);
  for (const s of slots) {
    colHeights[s.col] = Math.max(colHeights[s.col], s.top + s.height);
  }
  const totalHeight = Math.max(0, ...colHeights);

  const columnNotes: QuickNote[][] = Array.from({ length: columns }, () => []);
  ordered.forEach((note, i) => {
    columnNotes[i % columns].push(note);
  });

  return (
    <View
      ref={containerRef}
      style={{ width: totalWidth, minHeight: arranging ? totalHeight : undefined }}
      onLayout={() => measureContainer()}
      {...pan.panHandlers}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap }} pointerEvents="box-none">
        {columnNotes.map((colNotes, col) => (
          <View key={col} style={{ width: columnWidth, gap }} pointerEvents="box-none">
            {colNotes.map((note) => {
              const isDragging = draggingId === note.id;
              return (
                <View
                  key={note.id}
                  onLayout={(e) => {
                    heights.current.set(note.id, e.nativeEvent.layout.height);
                  }}
                  style={{ opacity: isDragging ? 0.2 : 1 }}
                  pointerEvents={arranging && !isDragging ? "none" : "auto"}
                >
                  {renderCard(note, {
                    dragging: isDragging,
                    arranging,
                    startDrag: enabled
                      ? (pageX, pageY) => beginDrag(note.id, pageX, pageY)
                      : undefined,
                  })}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {draggingId && byId.get(draggingId) && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            zIndex: 40,
            elevation: 14,
            width: columnWidth,
            left: ghostOrigin.current.left,
            top: ghostOrigin.current.top,
            transform: [{ translateX: dragX }, { translateY: dragY }, { scale: dragScale }],
            shadowColor: "#000",
            shadowOpacity: 0.28,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            borderRadius: 14,
          }}
        >
          {renderCard(byId.get(draggingId)!, { dragging: true, arranging: true })}
        </Animated.View>
      )}
    </View>
  );
}
