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
  onSwipeMonth,
}: Props) {
  const heightAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const dragY = useRef(0);

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

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
      onPanResponderGrant: () => {
        dragY.current = 0;
      },
      onPanResponderMove: (_, g) => {
        dragY.current = g.dy;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -28 || g.vy < -0.4) onExpandedChange(false);
        else if (g.dy > 28 || g.vy > 0.4) onExpandedChange(true);
        if (Math.abs(g.dx) > 48 && Math.abs(g.dx) > Math.abs(g.dy)) {
          onSwipeMonth?.(g.dx < 0 ? 1 : -1);
        }
      },
    })
  ).current;

  function renderDay(day: Date) {
    const inMonth = day.getMonth() === anchor.getMonth();
    const isToday = sameDay(day, today);
    const isSelected = sameDay(day, selected);
    const open = tasksOnDay(byDay, day).filter((t) => !t.done);
    const bars = open.slice(0, 3);

    // High-contrast fill + ink so the selected day never "vanishes" into the page bg.
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
        style={styles.cell}
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
          {bars.map((t) => (
            <View
              key={t.id}
              style={[
                styles.bar,
                {
                  backgroundColor: t.starred ? colors.accent : colors.textSecondary,
                  opacity: t.starred ? 0.95 : 0.55,
                },
              ]}
            />
          ))}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.weekHead}>
        {weekLabels.map((label, i) => (
          <Text key={i} style={[styles.weekHeadText, { color: colors.textSecondary }]}>
            {label}
          </Text>
        ))}
      </View>

      {/*
        Collapsed: render only the selected week (no translate clipping).
        Expanded: full month grid. Height still springs between 1 and 6 rows.
      */}
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
        accessibilityLabel={expanded ? "Collapse calendar" : "Expand calendar"}
      >
        <View style={[styles.handlePill, { backgroundColor: colors.border }]} />
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
  wrap: { marginBottom: 2 },
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
    letterSpacing: 0.3,
  },
  clip: {
    overflow: "hidden",
  },
  row: {
    height: ROW_H,
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 2,
  },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  bars: {
    marginTop: 2,
    width: "70%",
    maxHeight: 12,
    gap: 2,
    alignItems: "center",
    overflow: "hidden",
  },
  bar: {
    width: "100%",
    height: 3,
    borderRadius: 999,
  },
  handle: {
    height: HANDLE_H,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  handlePill: {
    width: 36,
    height: 4,
    borderRadius: 999,
    opacity: 0.7,
  },
});
