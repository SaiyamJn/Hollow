import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
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

/**
 * Long-press + drag reorder that stays in a masonry (multi-column) layout.
 * Order is linear; cards alternate across columns (0→left, 1→right, …).
 */
export function ReorderableNoteList({
  notes,
  enabled,
  columns = 2,
  columnWidth,
  gap = 10,
  kickoffId,
  onKickoffConsumed,
  renderCard,
  onReorder,
}: {
  notes: QuickNote[];
  enabled: boolean;
  columns?: number;
  columnWidth: number;
  gap?: number;
  kickoffId?: string | null;
  onKickoffConsumed?: () => void;
  renderCard: (note: QuickNote, opts: { dragging: boolean; arranging: boolean }) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState(notes.map((n) => n.id));
  const orderRef = useRef(order);
  const heights = useRef<Map<string, number>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
    if (!draggingId) {
      setOrder(ids);
      orderRef.current = ids;
    }
  }, [notes, draggingId]);

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
    if (!enabled) return;
    measureContainer();
    refreshSlots();
    const slot = slotsRef.current.find((s) => s.id === id);
    ghostOrigin.current = { left: slot?.left ?? 0, top: slot?.top ?? 0 };
    startPageX.current = pageX;
    startPageY.current = pageY;
    dragX.setValue(0);
    dragY.setValue(0);
    lastHover.current = orderRef.current.indexOf(id);
    setDraggingId(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(dragScale, { toValue: 1.04, useNativeDriver: true, friction: 7, tension: 100 }).start();
  }

  useEffect(() => {
    if (!kickoffId || !enabled) return;
    const t = setTimeout(() => {
      measureContainer();
      refreshSlots();
      const slot = slotsRef.current.find((s) => s.id === kickoffId);
      ghostOrigin.current = { left: slot?.left ?? 0, top: slot?.top ?? 0 };
      startPageX.current = containerX.current + (slot?.left ?? 0) + columnWidth / 2;
      startPageY.current = containerY.current + (slot?.top ?? 0) + (slot?.height ?? 40) / 2;
      dragX.setValue(0);
      dragY.setValue(0);
      lastHover.current = orderRef.current.indexOf(kickoffId);
      setDraggingId(kickoffId);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.spring(dragScale, { toValue: 1.04, useNativeDriver: true, friction: 7, tension: 100 }).start();
      onKickoffConsumed?.();
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickoffId]);

  const byId = new Map(notes.map((n) => [n.id, n]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as QuickNote[];
  const arranging = !!draggingId;
  const slots = buildSlots(order, heights.current, columns, columnWidth, gap);
  slotsRef.current = slots;

  function indexFromPoint(pageX: number, pageY: number): number {
    const localX = pageX - containerX.current;
    const localY = pageY - containerY.current;
    const ids = orderRef.current;
    if (!ids.length) return 0;

    // Prefer the column under the finger, then nearest vertical mid in that column.
    const col = Math.max(0, Math.min(columns - 1, Math.floor(localX / (columnWidth + gap))));
    const inCol = slotsRef.current.filter((s) => s.col === col);
    if (inCol.length === 0) {
      // Empty column — place at end of list with that column parity
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
    if (!draggingId || to === lastHover.current) return;
    const from = orderRef.current.indexOf(draggingId);
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
    if (!draggingId) return;
    Animated.parallel([
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }),
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }),
      Animated.spring(dragScale, { toValue: 1, useNativeDriver: true, friction: 8 }),
    ]).start();
    const ids = orderRef.current.slice();
    setDraggingId(null);
    lastHover.current = -1;
    onReorder(ids);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        dragX.setValue(g.dx);
        dragY.setValue(g.dy);
        refreshSlots();
        applyHover(indexFromPoint(startPageX.current + g.dx, startPageY.current + g.dy));
      },
      onPanResponderRelease: () => finishDrag(),
      onPanResponderTerminate: () => finishDrag(),
    })
  ).current;

  const dragSlot = draggingId ? slots.find((s) => s.id === draggingId) : undefined;
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
      {...(arranging ? pan.panHandlers : {})}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap }}>
        {columnNotes.map((colNotes, col) => (
          <View key={col} style={{ width: columnWidth, gap }}>
            {colNotes.map((note) => {
              const isDragging = draggingId === note.id;
              return (
                <View
                  key={note.id}
                  onLayout={(e) => {
                    heights.current.set(note.id, e.nativeEvent.layout.height);
                  }}
                  style={{ opacity: isDragging ? 0.2 : 1 }}
                >
                  <Pressable
                    delayLongPress={220}
                    onLongPress={(e) =>
                      beginDrag(note.id, e.nativeEvent.pageX, e.nativeEvent.pageY)
                    }
                    disabled={!enabled}
                  >
                    {renderCard(note, { dragging: isDragging, arranging })}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {draggingId && byId.get(draggingId) && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghost,
            {
              width: columnWidth,
              left: ghostOrigin.current.left,
              top: ghostOrigin.current.top,
              transform: [{ translateX: dragX }, { translateY: dragY }, { scale: dragScale }],
            },
          ]}
        >
          {renderCard(byId.get(draggingId)!, { dragging: true, arranging: true })}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: "absolute",
    zIndex: 40,
    elevation: 14,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    borderRadius: 14,
  },
});
