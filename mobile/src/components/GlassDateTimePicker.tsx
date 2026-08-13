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

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS_24 = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // Google-style 5-min steps

/** Compact wheel metrics — same snap behaviour, less vertical space. */
const ITEM_H = 28;
const VISIBLE = 3;
const PAD = Math.floor(VISIBLE / 2);
const CELL_H = 36;

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

function startOfDay(d: Date) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Date-only due times are stored at local midnight. */
export function isDateOnlyDue(due: Date) {
  return due.getHours() === 0 && due.getMinutes() === 0 && due.getSeconds() === 0;
}

export function formatDueLabel(iso: string | Date | null | undefined) {
  if (!iso) return "No due date";
  const due = typeof iso === "string" ? new Date(iso) : iso;
  const date = due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (isDateOnlyDue(due)) return date;
  const hh = String(due.getHours()).padStart(2, "0");
  const mm = String(due.getMinutes()).padStart(2, "0");
  return `${date} · ${hh}:${mm}`;
}

function snapMinute(m: number) {
  return Math.min(55, Math.round(m / 5) * 5);
}

/** Finite Apple-style snap wheel — smooth, not infinite. */
function RollingColumn({
  items,
  value,
  onChange,
  format = (n: number | string) => String(n).padStart(2, "0"),
  width = 44,
}: {
  items: (number | string)[];
  value: number | string;
  onChange: (n: number | string) => void;
  format?: (n: number | string) => string;
  width?: number;
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
    const vy = e.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(vy) < 0.05) commit(e.nativeEvent.contentOffset.y);
  }

  return (
    <View style={[styles.wheel, { width }]}>
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
        decelerationRate={0.92}
        disableIntervalMomentum
        nestedScrollEnabled
        scrollEventThrottle={16}
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
          const distance = Math.abs(items.indexOf(n) - index);
          const faded = distance >= 2;
          return (
            <Pressable
              key={String(n)}
              onPress={() => {
                onChange(n);
                ref.current?.scrollTo({ y: items.indexOf(n) * ITEM_H, animated: true });
              }}
              style={styles.wheelItem}
            >
              <Text
                style={{
                  color: active ? colors.textPrimary : colors.textSecondary,
                  fontSize: active ? 15 : 13,
                  fontWeight: active ? "600" : "400",
                  opacity: faded ? 0.35 : active ? 1 : 0.7,
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

/**
 * Google Tasks–style due picker:
 * calendar + optional time (date-only by default), with Today / Tomorrow / Next week chips.
 */
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
  const hasTime = Boolean(selected && !isDateOnlyDue(selected));
  const [showTime, setShowTime] = useState(hasTime);

  useEffect(() => {
    setShowTime(Boolean(selected && !isDateOnlyDue(selected)));
  }, [selected]);

  const hour24 = selected && hasTime ? selected.getHours() : 9;
  const minute = selected && hasTime ? snapMinute(selected.getMinutes()) : 0;

  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

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

  function applyDay(day: Date, withTime: boolean) {
    const next = startOfDay(day);
    if (withTime) {
      next.setHours(hour24, minute, 0, 0);
    }
    onChange(next);
  }

  function pickDay(day: Date) {
    applyDay(day, showTime);
  }

  function pickChip(day: Date) {
    setCursor(new Date(day.getFullYear(), day.getMonth(), 1));
    applyDay(day, showTime);
  }

  function setTime(h: number, m: number) {
    const base = selected ? startOfDay(selected) : startOfDay(new Date());
    base.setHours(h, snapMinute(m), 0, 0);
    onChange(base);
  }

  function enableTime() {
    const base = selected ? startOfDay(selected) : startOfDay(new Date());
    base.setHours(9, 0, 0, 0);
    setShowTime(true);
    onChange(base);
  }

  function clearTime() {
    if (!selected) {
      setShowTime(false);
      return;
    }
    setShowTime(false);
    onChange(startOfDay(selected));
  }

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const chips: { label: string; day: Date }[] = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: tomorrow },
    { label: "Next week", day: nextWeek },
  ];

  return (
    <View style={[styles.wrap, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
      <View style={styles.chips}>
        {chips.map(({ label, day }) => {
          const active = selected ? sameDay(day, selected) : false;
          return (
            <Pressable
              key={label}
              onPress={() => pickChip(day)}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.accent : colors.glassBorder,
                  backgroundColor: active ? colors.accentSoft : "transparent",
                },
              ]}
            >
              <Text style={{ color: active ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: "500" }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          hitSlop={8}
          style={styles.monthNav}
        >
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500", textAlign: "center", flex: 1 }}>
          {monthLabel}
        </Text>
        <Pressable
          onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          hitSlop={8}
          style={styles.monthNav}
        >
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`${d}-${i}`} style={[styles.cellLabel, { color: colors.textSecondary }]}>
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
              key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
              onPress={() => pickDay(day)}
              style={styles.cell}
            >
              <View
                style={[
                  styles.dayDisc,
                  isSelected && { backgroundColor: colors.accent },
                  !isSelected && isToday && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
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
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.timeBlock, { borderTopColor: colors.glassBorder }]}>
        {showTime ? (
          <>
            <View style={styles.timeHeader}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Time</Text>
              <Pressable onPress={clearTime} hitSlop={8}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Remove time</Text>
              </Pressable>
            </View>
            <View
              style={[
                styles.wheels,
                { borderColor: colors.glassBorder, backgroundColor: colors.surface1 },
              ]}
            >
              <RollingColumn
                items={HOURS_24}
                value={hour24}
                onChange={(h) => setTime(Number(h), minute)}
                format={(n) => String(n).padStart(2, "0")}
              />
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>:</Text>
              <RollingColumn
                items={MINUTES}
                value={minute}
                onChange={(m) => setTime(hour24, Number(m))}
              />
            </View>
          </>
        ) : (
          <Pressable onPress={enableTime} style={styles.setTimeRow} hitSlop={6}>
            <Feather name="clock" size={15} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Set time</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 6,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 2,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 },
  monthNav: { padding: 4 },
  weekRow: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    height: CELL_H,
    alignItems: "center",
    justifyContent: "center",
  },
  dayDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLabel: { width: "14.28%", textAlign: "center", fontSize: 11, marginBottom: 2, fontWeight: "500" },
  timeBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 6,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  setTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  wheels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 2,
  },
  wheel: {
    width: 44,
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
    borderRadius: ITEM_H / 2,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  fadeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_H * 1.1,
    zIndex: 3,
  },
  fadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_H * 1.1,
    zIndex: 3,
  },
});
