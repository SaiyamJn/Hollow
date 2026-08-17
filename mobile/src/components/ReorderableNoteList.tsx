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

/**
 * Long-press a note, then drag to reorder. Uses a single-column stack while
 * dragging so motion stays smooth; parent can still show masonry when idle.
 */
export function ReorderableNoteList({
  notes,
  enabled,
  kickoffId,
  onKickoffConsumed,
  renderCard,
  onReorder,
}: {
  notes: QuickNote[];
  enabled: boolean;
  /** When set, immediately start dragging this note (e.g. after long-press in masonry). */
  kickoffId?: string | null;
  onKickoffConsumed?: () => void;
  renderCard: (note: QuickNote, opts: { dragging: boolean; arranging: boolean }) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState(notes.map((n) => n.id));
  const orderRef = useRef(order);
  const heights = useRef<Map<string, number>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const startPageY = useRef(0);
  const lastHover = useRef(-1);
  const containerY = useRef(0);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    const ids = notes.map((n) => n.id);
    if (!draggingId) {
      setOrder(ids);
      orderRef.current = ids;
    }
  }, [notes, draggingId]);

  useEffect(() => {
    if (!kickoffId || !enabled) return;
    const t = setTimeout(() => {
      containerRef.current?.measureInWindow((_x, y) => {
        containerY.current = y;
      });
      // Approximate start at mid of kicked-off row
      const idx = orderRef.current.indexOf(kickoffId);
      startPageY.current = containerY.current + offsetOf(Math.max(0, idx)) + 40;
      dragY.setValue(0);
      lastHover.current = idx;
      setDraggingId(kickoffId);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.spring(dragScale, { toValue: 1.03, useNativeDriver: true, friction: 7, tension: 100 }).start();
      onKickoffConsumed?.();
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickoffId]);

  const byId = new Map(notes.map((n) => [n.id, n]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as QuickNote[];
  const arranging = !!draggingId;

  function offsetOf(index: number): number {
    const ids = orderRef.current;
    let y = 0;
    for (let i = 0; i < index; i++) {
      y += (heights.current.get(ids[i]) ?? ROW_ESTIMATE) + 10;
    }
    return y;
  }

  function indexFromPageY(pageY: number): number {
    const local = pageY - containerY.current;
    const ids = orderRef.current;
    let acc = 0;
    for (let i = 0; i < ids.length; i++) {
      const h = (heights.current.get(ids[i]) ?? ROW_ESTIMATE) + 10;
      if (local < acc + h / 2) return i;
      acc += h;
    }
    return Math.max(0, ids.length - 1);
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
        dragY.setValue(g.dy);
        applyHover(indexFromPageY(startPageY.current + g.dy));
      },
      onPanResponderRelease: () => finishDrag(),
      onPanResponderTerminate: () => finishDrag(),
    })
  ).current;

  function beginDrag(id: string, pageY: number) {
    if (!enabled) return;
    containerRef.current?.measureInWindow((_x, y) => {
      containerY.current = y;
    });
    startPageY.current = pageY;
    dragY.setValue(0);
    lastHover.current = orderRef.current.indexOf(id);
    setDraggingId(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(dragScale, { toValue: 1.03, useNativeDriver: true, friction: 7, tension: 100 }).start();
  }

  const dragIndex = draggingId ? order.indexOf(draggingId) : -1;
  const ghostTop = dragIndex >= 0 ? offsetOf(dragIndex) : 0;

  return (
    <View
      ref={containerRef}
      style={{ gap: 10 }}
      onLayout={() => {
        containerRef.current?.measureInWindow((_x, y) => {
          containerY.current = y;
        });
      }}
      {...(arranging ? pan.panHandlers : {})}
    >
      {ordered.map((note) => {
        const isDragging = draggingId === note.id;
        return (
          <View
            key={note.id}
            onLayout={(e) => {
              heights.current.set(note.id, e.nativeEvent.layout.height);
            }}
            style={{ opacity: isDragging ? 0.25 : 1 }}
          >
            <Pressable
              delayLongPress={200}
              onLongPress={(e) => beginDrag(note.id, e.nativeEvent.pageY)}
              disabled={!enabled}
            >
              {renderCard(note, { dragging: isDragging, arranging })}
            </Pressable>
          </View>
        );
      })}

      {draggingId && byId.get(draggingId) && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghost,
            {
              top: ghostTop,
              transform: [{ translateY: dragY }, { scale: dragScale }],
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
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 14,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    borderRadius: 14,
  },
});
