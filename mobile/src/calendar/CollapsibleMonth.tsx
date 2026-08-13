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
  startOfMonth,
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

/** TickTick-style month that rolls between full grid and a single week. */
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
  const anim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const dragY = useRef(0);

  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const weekLabels = useMemo(
    () => weekDays(today).map((d) => d.toLocaleDateString(undefined, { weekday: "narrow" })),
    [today]
  );

  const selectedWeekIndex = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(anchor), 0);
    const diff = Math.round((startOfWeek(selected, 0).getTime() - gridStart.getTime()) / 86400000);
    const idx = Math.floor(diff / 7);
    return Math.max(0, Math.min(ROWS - 1, idx));
  }, [anchor, selected]);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      friction: 12,
      tension: 48,
      overshootClamping: true,
    }).start();
  }, [expanded, anim]);

  const height = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [ROW_H, ROW_H * ROWS],
  });

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-selectedWeekIndex * ROW_H, 0],
  });

  const handleRot = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        dragY.current = 0;
      },
      onPanResponderMove: (_, g) => {
        dragY.current = g.dy;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -28 || g.vy < -0.4) onExpandedChange(false);
        else if (g.dy > 28 || g.vy > 0.4) onExpandedChange(true);
        // horizontal flick → month change
        if (Math.abs(g.dx) > 48 && Math.abs(g.dx) > Math.abs(g.dy)) {
          onSwipeMonth?.(g.dx < 0 ? 1 : -1);
        }
      },
    })
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.weekHead}>
        {weekLabels.map((label, i) => (
          <Text key={i} style={[styles.weekHeadText, { color: colors.textSecondary }]}>
            {label}
          </Text>
        ))}
      </View>

      <Animated.View style={[styles.clip, { height }]} {...pan.panHandlers}>
        <Animated.View style={{ transform: [{ translateY }] }}>
          {Array.from({ length: ROWS }, (_, row) => (
            <View key={row} style={styles.row}>
              {cells.slice(row * 7, row * 7 + 7).map((day) => {
                const inMonth = day.getMonth() === anchor.getMonth();
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selected);
                const list = tasksOnDay(byDay, day);
                const open = list.filter((t) => !t.done);
                const bars = open.slice(0, 3);
                return (
                  <Pressable
                    key={dayKey(day)}
                    onPress={() => onSelectDay(day)}
                    style={styles.cell}
                  >
                    <View
                      style={[
                        styles.dayBubble,
                        isSelected && {
                          backgroundColor: colors.accent,
                          borderWidth: 0,
                        },
                        // Keep today's ring even when another day is selected.
                        isToday &&
                          !isSelected && {
                            backgroundColor: "transparent",
                            borderWidth: 1.5,
                            borderColor: colors.accent,
                          },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isToday || isSelected ? "600" : "400",
                          color: isSelected
                            ? colors.surface0
                            : inMonth
                              ? colors.textPrimary
                              : colors.textSecondary,
                          opacity: inMonth ? 1 : 0.35,
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
                              opacity: t.starred ? 0.95 : 0.5,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
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
  // Prefer same day-of-month, else last day of month
  const last = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const day = Math.min(selected.getDate(), last);
  return new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), day);
}

export function weekContaining(d: Date): Date[] {
  const start = startOfWeek(d, 0);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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
    overflow: "hidden",
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

export const COLLAPSIBLE_MONTH_HEIGHT = {
  weekday: WEEKDAY_H,
  row: ROW_H,
  handle: HANDLE_H,
  expanded: WEEKDAY_H + ROW_H * ROWS + HANDLE_H,
  collapsed: WEEKDAY_H + ROW_H + HANDLE_H,
};
