import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeColors } from "../theme";
import {
  addDays,
  dayKey,
  monthGrid,
  sameDay,
  startOfWeek,
  weekDays,
} from "./dateUtils";
import type { CalendarTask } from "./taskIndex";
import { tasksOnDay } from "./taskIndex";
import { normalizeFocus, sortByFocusPriority } from "../lib/taskFocus";
import { useFocusColors } from "../contexts/focusColors";

const ROW_H = 52;
const WEEKDAY_H = 28;
const HANDLE_H = 22;
const ROWS = 6;

type Props = {
  colors: ThemeColors;
  anchor: Date;
  selected: Date;
  today: Date;
  byDay: Map<string, CalendarTask[]>;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  onSelectDay: (d: Date) => void;
  /** Long-press a day to create (mirrors desktop click-to-add). */
  onCreateDay?: (d: Date) => void;
  onSwipeMonth?: (dir: -1 | 1) => void;
};

/** TickTick-style month: one week when collapsed, full grid when expanded. */
export function CollapsibleMonth({
  colors,
  anchor,
  selected,
  today,
  byDay,
  expanded,
  onExpandedChange,
  onSelectDay,
  onCreateDay,
  onSwipeMonth,
}: Props) {
  const { colorFor } = useFocusColors();
  const heightAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const weekStrip = useMemo(() => {
    const start = startOfWeek(selected, 0);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const weekLabels = useMemo(
    () => weekDays(today).map((d) => d.toLocaleDateString(undefined, { weekday: "narrow" })),
    [today]
  );

  useEffect(() => {
    Animated.spring(heightAnim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      friction: 12,
      tension: 48,
      overshootClamping: true,
    }).start();
  }, [expanded, heightAnim]);

  const height = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [ROW_H, ROW_H * ROWS],
  });

  const handleRot = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  // Keep latest callbacks for a stable PanResponder (avoids stale closures).
  const onExpandedChangeRef = useRef(onExpandedChange);
  const onSwipeMonthRef = useRef(onSwipeMonth);
  onExpandedChangeRef.current = onExpandedChange;
  onSwipeMonthRef.current = onSwipeMonth;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        if (ax < 10 && ay < 10) return false;
        if (ax > 12 && ax > ay * 1.1) return true;
        return ay > 8 && ay > ax * 1.2;
      },
      onPanResponderRelease: (_, g) => {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        if (ax > 40 && ax > ay) {
          onSwipeMonthRef.current?.(g.dx < 0 ? 1 : -1);
          return;
        }
        if (g.dy < -28 || g.vy < -0.4) onExpandedChangeRef.current(false);
        else if (g.dy > 28 || g.vy > 0.4) onExpandedChangeRef.current(true);
      },
    })
  ).current;

  function renderDay(day: Date) {
    const inMonth = day.getMonth() === anchor.getMonth();
    const isToday = sameDay(day, today);
    const isSelected = sameDay(day, selected);
    const isPast = day < today;
    const dayList = sortByFocusPriority(tasksOnDay(byDay, day));
    // Indicator bars: open tasks first (completed still appear in the day list)
    const bars = dayList.filter((t) => !t.done).slice(0, 3);

    const bubbleBg = isSelected ? colors.accent : "transparent";
    const bubbleBorderW = !isSelected && isToday ? 1.5 : 0;
    const bubbleBorderC = colors.accent;
    const labelColor = isSelected
      ? colors.surface0
      : inMonth
        ? colors.textPrimary
        : colors.textSecondary;

    return (
      <Pressable
        key={dayKey(day)}
        onPress={() => onSelectDay(day)}
        onLongPress={() => onCreateDay?.(day)}
        delayLongPress={320}
        style={[styles.cell, isPast && inMonth && !isSelected && { opacity: 0.4 }]}
        hitSlop={4}
      >
        <View
          style={[
            styles.dayBubble,
            {
              backgroundColor: bubbleBg,
              borderWidth: bubbleBorderW,
              borderColor: bubbleBorderC,
            },
          ]}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: isToday || isSelected ? "700" : "400",
              color: labelColor,
              opacity: inMonth || isSelected ? 1 : 0.4,
            }}
          >
            {day.getDate()}
          </Text>
        </View>
        <View style={styles.bars}>
          {bars.map((t) => {
            const focus = normalizeFocus(t.focus);
            const c = colorFor(focus) || colors.textSecondary;
            return (
              <View
                key={t.id}
                style={[
                  styles.bar,
                  {
                    backgroundColor: t.starred ? colors.accent : c,
                    opacity: t.virtual ? 0.4 : 0.9,
                  },
                ]}
              />
            );
          })}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.weekHead}>
        {weekLabels.map((label, i) => (
          <Text
            key={i}
            style={[
              styles.weekHeadText,
              { color: i === 0 || i === 6 ? colors.accent : colors.textSecondary },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>

      <Animated.View style={[styles.clip, { height }]} {...pan.panHandlers}>
        {expanded ? (
          Array.from({ length: ROWS }, (_, row) => (
            <View key={row} style={styles.row}>
              {cells.slice(row * 7, row * 7 + 7).map((day) => renderDay(day))}
            </View>
          ))
        ) : (
          <View style={styles.row}>{weekStrip.map((day) => renderDay(day))}</View>
        )}
      </Animated.View>

      <Pressable
        onPress={() => onExpandedChange(!expanded)}
        hitSlop={10}
        style={styles.handle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse month" : "Expand month"}
      >
        <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
        <Animated.View style={{ transform: [{ rotate: handleRot }] }}>
          <Feather name="chevron-down" size={16} color={colors.textSecondary} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Keep selected day on-screen when month changes. */
export function ensureSelectedInMonth(selected: Date, monthAnchor: Date): Date {
  if (selected.getMonth() === monthAnchor.getMonth() && selected.getFullYear() === monthAnchor.getFullYear()) {
    return selected;
  }
  const last = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const day = Math.min(selected.getDate(), last);
  return new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), day);
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  weekHead: {
    height: WEEKDAY_H,
    flexDirection: "row",
    alignItems: "center",
  },
  weekHeadText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
  },
  clip: { overflow: "hidden" },
  row: { height: ROW_H, flexDirection: "row" },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 2,
  },
  dayBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bars: {
    marginTop: 2,
    width: "70%",
    gap: 2,
    alignItems: "stretch",
  },
  bar: {
    height: 3,
    borderRadius: 2,
  },
  handle: {
    height: HANDLE_H,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  handleBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
  },
});
