import { useEffect, useRef } from "react";
import { View, type View as ViewType } from "react-native";

export const LONG_PRESS_MS = 400;
export const ACTIVATE_PX = 14;
export const SWAP_COOLDOWN_MS = 220;

type Props = {
  /** Unique slot key used by the parent to identify this row for swapping. */
  slotKey: string;
  /** Parent stores a ref to this row's View so it can measure its screen position. */
  registerSlot: (slotKey: string, view: ViewType | null) => void;
  /** Highlight the row as the current drop target. */
  hovered?: boolean;
  /** Accent color used for the hover highlight. */
  hoverColor?: string;
  children: React.ReactNode;
  style?: any;
};

/**
 * Wraps a single row (section or page) for long-press drag reordering.
 *
 * Deliberately thin: it (a) registers its own View so the parent can measure
 * slot positions, and (b) draws the hover highlight on the drop target. The
 * long-press gesture itself lives on the row's main body Pressable (in the
 * parent screen) because nested Pressables would swallow each other's long
 * presses — the parent owns the PanResponder and the swap logic.
 */
export function DraggableRow({ slotKey, registerSlot, hovered, hoverColor = "#0cb879", children, style }: Props) {
  const containerRef = useRef<ViewType>(null);

  useEffect(() => {
    registerSlot(slotKey, containerRef.current);
    return () => registerSlot(slotKey, null);
  }, [slotKey, registerSlot]);

  return (
    <View
      ref={containerRef}
      style={[style, hovered && { borderColor: hoverColor, borderWidth: 1.5, borderRadius: 14 }]}
    >
      {children}
    </View>
  );
}

// ─── Shared slot / hit-test helpers (used by the parent NotebookScreen) ─────

export type DragSlot = {
  slotKey: string;
  top: number;
  height: number;
};

/** Returns the slot the finger is over, ignoring the dragged row itself. */
export function hitTestSlot(
  pageX: number,
  pageY: number,
  containerX: number,
  containerY: number,
  slots: DragSlot[],
  excludeSlotKey: string | null
): DragSlot | null {
  if (!excludeSlotKey || slots.length === 0) return null;
  const isPage = excludeSlotKey.startsWith("page:");
  const localY = pageY - containerY;

  // Filter slots to only those matching the dragged item's type
  const matchingSlots = slots.filter((s) => {
    if (s.slotKey === excludeSlotKey) return false;
    return isPage ? s.slotKey.startsWith("page:") : s.slotKey.startsWith("sec:");
  });

  if (matchingSlots.length === 0) return null;

  // First check if localY falls directly within a slot's vertical span
  for (const s of matchingSlots) {
    if (localY >= s.top && localY <= s.top + s.height) {
      return s;
    }
  }

  // Otherwise, find the closest slot by midpoint distance
  let best: DragSlot | null = null;
  let bestDist = Infinity;
  for (const s of matchingSlots) {
    const mid = s.top + s.height / 2;
    const dist = Math.abs(localY - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return bestDist < 120 ? best : null;
}
