import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Floating tab pill metrics — keep in sync with HollowTabBar. */
export const TAB_BAR_HEIGHT = 46;
export const TAB_BAR_LIFT = 12;
export const FAB_SIZE = 52;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isNarrow = width < 360;
  const isShort = height < 700;
  const screenPad = isNarrow ? 12 : 16;
  const tabBarBottom = Math.max(insets.bottom, 10) + (isShort ? 8 : TAB_BAR_LIFT);
  // Compact pill, but wide enough that all 4 icons stay visible.
  const tabBarMarginH = Math.min(40, Math.max(16, (width - 300) / 2));

  return {
    height,
    insets,
    isNarrow,
    isShort,
    screenPad,
    tabBarBottom,
    tabBarMarginH,
    /** Bottom padding for tab screens so content clears the floating pill (+ optional FAB). */
    listBottomClearance: (hasFab = false) =>
      tabBarBottom + TAB_BAR_HEIGHT + (hasFab ? FAB_SIZE + 20 : 16) + 12,
    /** FAB sits just above the tab pill. */
    fabBottom: tabBarBottom + TAB_BAR_HEIGHT + 12,
    /** Stack screens (no tab bar). */
    stackBottomClearance: (hasFab = false) =>
      Math.max(insets.bottom, 12) + (hasFab ? FAB_SIZE + 28 : 24),
    fabBottomStack: Math.max(insets.bottom, 12) + 16,
  };
}

/** Truncate long titles used in FAB menus / headers. */
export function truncateLabel(text: string, max = 22): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
