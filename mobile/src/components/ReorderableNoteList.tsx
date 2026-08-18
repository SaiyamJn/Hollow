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
/** Finger must travel this far before any swap can happen. */
const ACTIVATE_PX = 36;
/** Ignore the outer edges of a card so near-misses don't steal the slot. */
const EDGE_INSET = 0.28;
/** Minimum time between swaps — stops cascade reshuffles. */
const SWAP_COOLDOWN_MS = 280;

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
 * Swaps only when the finger clearly rests on another card (not on tiny wobble).
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
  const armedRef = useRef(false);
  const lastSwapAt = useRef(0);
  const lastTargetId = useRef<string | null>(null);
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
    armedRef.current = false;
    lastSwapAt.current = 0;
    lastTargetId.current = null;
    initialOrderRef.current = orderRef.current.slice();
    draggingIdRef.current = id;
    setDraggingId(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(dragScale, { toValue: 1.04, useNativeDriver: true, friction: 7, tension: 100 }).start();
  }

  /** Only returns a target when the finger is clearly inside another card. */
  function targetSlotFromPoint(pageX: number, pageY: number): Slot | null {
    const localX = pageX - containerX.current;
    const localY = pageY - containerY.current;
    const dragId = draggingIdRef.current;

    for (const s of slotsRef.current) {
      if (s.id === dragId) continue;
      const insetY = Math.max(12, s.height * EDGE_INSET);
      const insetX = columnWidth * 0.18;
      const inside =
        localX >= s.left + insetX &&
        localX <= s.left + columnWidth - insetX &&
        localY >= s.top + insetY &&
        localY <= s.top + s.height - insetY;
      if (inside) return s;
    }
    return null;
  }

  function applyHover(target: Slot | null) {
    const id = draggingIdRef.current;
    if (!id || !armedRef.current || !target) {
      if (!target) lastTargetId.current = null;
      return;
    }
    // Must stay on the same target briefly — crossing a gap resets.
    if (lastTargetId.current !== target.id) {
      lastTargetId.current = target.id;
      lastSwapAt.current = Date.now(); // start dwell timer
      return;
    }
    if (Date.now() - lastSwapAt.current < SWAP_COOLDOWN_MS) return;

    const from = orderRef.current.indexOf(id);
    const to = target.index;
    if (from < 0 || from === to) return;

    lastSwapAt.current = Date.now();
    lastTargetId.current = null; // require a fresh dwell after layout shifts
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
    const changed = armedRef.current && !sameOrder(ids, initialOrderRef.current);
    draggingIdRef.current = null;
    setDraggingId(null);
    armedRef.current = false;
    lastTargetId.current = null;
    if (changed) onReorder(ids);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!draggingIdRef.current,
      onStartShouldSetPanResponderCapture: () => !!draggingIdRef.current,
      onMoveShouldSetPanResponder: () => !!draggingIdRef.current,
      onMoveShouldSetPanResponderCapture: () => !!draggingIdRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (e: GestureResponderEvent) => {
        if (!draggingIdRef.current) return;
        const { pageX, pageY } = e.nativeEvent;
        const dx = pageX - startPageX.current;
        const dy = pageY - startPageY.current;
        dragX.setValue(dx);
        dragY.setValue(dy);

        if (!armedRef.current) {
          if (Math.hypot(dx, dy) < ACTIVATE_PX) return;
          armedRef.current = true;
          void Haptics.selectionAsync();
        }

        refreshSlots();
        applyHover(targetSlotFromPoint(pageX, pageY));
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
