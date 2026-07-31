import { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../contexts/theme";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);

const ITEM_H = 36;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2);

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function formatDueLabel(iso: string | Date | null | undefined) {
  if (!iso) return "No due date";
  const due = typeof iso === "string" ? new Date(iso) : iso;
  const date = due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

/** Finite Apple-style snap wheel — smooth, not infinite. */
function RollingColumn({
  items,
  value,
  onChange,
  format = (n: number) => String(n).padStart(2, "0"),
}: {
  items: number[];
  value: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  const dragging = useRef(false);
  const index = Math.max(0, items.indexOf(value));

  useEffect(() => {
    if (dragging.current) return;
    ref.current?.scrollTo({ y: index * ITEM_H, animated: true });
  }, [index]);

  function commit(offsetY: number) {
    const i = Math.min(items.length - 1, Math.max(0, Math.round(offsetY / ITEM_H)));
    const next = items[i];
    if (next !== value) onChange(next);
    dragging.current = false;
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    commit(e.nativeEvent.contentOffset.y);
  }

  function onScrollEndDrag(e: NativeSyntheticEvent<NativeScrollEvent>) {
    // If velocity is near zero, momentum end may not fire — snap here too.
    const vy = e.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(vy) < 0.05) commit(e.nativeEvent.contentOffset.y);
  }

  return (
    <View style={styles.wheel}>
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          { backgroundColor: colors.accentSoft, borderColor: `${colors.accent}40` },
        ]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[colors.surface1, `${colors.surface1}00`]}
        style={styles.fadeTop}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.surface1}00`, colors.surface1]}
        style={styles.fadeBottom}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        disableIntervalMomentum
        nestedScrollEnabled
        onLayout={() => {
          ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
        }}
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={onScrollEndDrag}
        contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
      >
        {items.map((n) => {
          const active = n === value;
          return (
            <Pressable
              key={n}
              onPress={() => {
                onChange(n);
                ref.current?.scrollTo({ y: items.indexOf(n) * ITEM_H, animated: true });
              }}
              style={styles.wheelItem}
            >
              <Text
                style={{
                  color: active ? colors.textPrimary : colors.textSecondary,
                  fontSize: 15,
                  fontWeight: active ? "600" : "400",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {format(n)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Glass month grid + Apple-style rolling time — matches web DateTimePicker. */
export function GlassDateTimePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (next: Date | null) => void;
}) {
  const { colors } = useTheme();
  const initial = value ?? new Date();
  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const selected = value;
  const hour = selected?.getHours() ?? 9;
  const minute = selected?.getMinutes() ?? 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const count = daysInMonth(year, month);
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= count; d++) out.push(new Date(year, month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  function pickDay(day: Date) {
    const next = new Date(day);
    next.setHours(hour, minute, 0, 0);
    onChange(next);
  }

  function setTime(h: number, m: number) {
    const base = selected ? new Date(selected) : new Date();
    base.setHours(h, m, 0, 0);
    onChange(base);
  }

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <View style={[styles.wrap, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500", textAlign: "center", flex: 1 }}>
          {monthLabel}
        </Text>
        <Pressable
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          hitSlop={8}
        >
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[styles.cellLabel, { color: colors.textSecondary }]}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={styles.cell} />;
          const isSelected = selected ? sameDay(day, selected) : false;
          const isToday = sameDay(day, today);
          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => pickDay(day)}
              style={[
                styles.cell,
                isSelected && { backgroundColor: colors.accent, borderRadius: 10 },
                !isSelected &&
                  isToday && {
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.accent,
                    borderRadius: 10,
                  },
              ]}
            >
              <Text
                style={{
                  color: isSelected ? "#0a0a0a" : colors.textPrimary,
                  fontSize: 13,
                  fontWeight: isSelected || isToday ? "600" : "400",
                }}
              >
                {day.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.timeBlock, { borderTopColor: colors.glassBorder }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 10, letterSpacing: 0.7, textAlign: "center" }}>
          TIME
        </Text>
        <View
          style={[
            styles.wheels,
            { borderColor: colors.glassBorder, backgroundColor: colors.surface1 },
          ]}
        >
          <RollingColumn items={HOURS} value={hour} onChange={(h) => setTime(h, minute)} />
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "600", marginBottom: 2 }}>:</Text>
          <RollingColumn items={MINUTES} value={minute} onChange={(m) => setTime(hour, m)} />
          {selected && (
            <Pressable onPress={() => onChange(null)} style={{ marginLeft: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Clear</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  weekRow: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLabel: { width: "14.28%", textAlign: "center", fontSize: 11 },
  timeBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  wheels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 4,
  },
  wheel: {
    width: 56,
    height: ITEM_H * VISIBLE,
    overflow: "hidden",
  },
  wheelItem: {
    height: ITEM_H,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ITEM_H * PAD,
    height: ITEM_H,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  fadeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_H * 1.35,
    zIndex: 3,
  },
  fadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_H * 1.35,
    zIndex: 3,
  },
});
