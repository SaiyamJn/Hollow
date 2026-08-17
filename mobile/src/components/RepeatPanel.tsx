import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../contexts/theme";
import type { TaskRepeatRule } from "../lib/types";
import {
  UNIT_OPTIONS,
  WEEKDAY_OPTIONS,
  clampInterval,
  defaultWeeklyDays,
  formatRepeatLabel,
  normalizeRepeatDays,
  normalizeRepeatEnd,
  type RepeatEnd,
} from "../lib/taskRepeat";

export type RepeatDraft = {
  repeat: TaskRepeatRule | null;
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: RepeatEnd | null;
  repeatUntil?: Date | null;
  repeatCount?: number | null;
};

/** Compact dedicated rhythm editor — meant to live in its own sheet. */
export function RepeatPanel({
  due,
  value,
  onChange,
  onPickUntil,
}: {
  due: Date | null;
  value: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
  onPickUntil: () => void;
}) {
  const { colors } = useTheme();
  const active = !!value.repeat;
  const interval = clampInterval(value.repeatInterval ?? 1);
  const rule = value.repeat ?? "daily";
  const weeklyDays = normalizeRepeatDays(value.repeatDays) ?? defaultWeeklyDays(due);
  const end = normalizeRepeatEnd(value.repeatEnd);
  const count = value.repeatCount && value.repeatCount > 0 ? value.repeatCount : 30;

  function setRule(next: TaskRepeatRule | null) {
    if (!next) {
      onChange({
        repeat: null,
        repeatDays: null,
        repeatInterval: 1,
        repeatEnd: null,
        repeatUntil: null,
        repeatCount: null,
      });
      return;
    }
    onChange({
      ...value,
      repeat: next,
      repeatInterval: interval,
      repeatDays: next === "weekly" ? weeklyDays : null,
      repeatEnd: value.repeatEnd ?? "never",
      repeatUntil: value.repeatEnd === "on" ? value.repeatUntil ?? null : null,
      repeatCount: value.repeatEnd === "after" ? count : null,
    });
  }

  function setEnd(next: RepeatEnd) {
    const until =
      next === "on"
        ? value.repeatUntil ??
          (() => {
            const d = due ? new Date(due) : new Date();
            d.setMonth(d.getMonth() + 1);
            return d;
          })()
        : null;
    onChange({
      ...value,
      repeat: rule,
      repeatEnd: next,
      repeatUntil: until,
      repeatCount: next === "after" ? count : null,
    });
  }

  function toggleDay(day: number) {
    const set = new Set(weeklyDays);
    if (set.has(day)) {
      if (set.size <= 1) return;
      set.delete(day);
    } else set.add(day);
    onChange({ ...value, repeat: "weekly", repeatDays: [...set].sort((a, b) => a - b) });
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Repeat</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: -6 }} numberOfLines={1}>
        {formatRepeatLabel({
          rule: value.repeat,
          days: value.repeatDays,
          interval: value.repeatInterval,
          end: value.repeatEnd,
          until: value.repeatUntil,
          count: value.repeatCount,
        })}
      </Text>

      {/* Off / units */}
      <View style={styles.unitRow}>
        <Pressable
          onPress={() => setRule(null)}
          style={[
            styles.unitChip,
            {
              borderColor: !active ? colors.accent : colors.glassBorder,
              backgroundColor: !active ? colors.accentSoft : colors.glass,
            },
          ]}
        >
          <Text style={{ color: !active ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
            Off
          </Text>
        </Pressable>
        {UNIT_OPTIONS.map((u) => {
          const on = active && rule === u.value;
          return (
            <Pressable
              key={u.value}
              onPress={() => setRule(u.value)}
              style={[
                styles.unitChip,
                {
                  borderColor: on ? colors.accent : colors.glassBorder,
                  backgroundColor: on ? colors.accentSoft : colors.glass,
                },
              ]}
            >
              <Text style={{ color: on ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                {u.singular}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {active && (
        <>
          {/* Every N */}
          <View style={styles.inlineRow}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>Every</Text>
            <View style={[styles.stepper, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              <Pressable
                onPress={() => onChange({ ...value, repeat: rule, repeatInterval: clampInterval(interval - 1) })}
                hitSlop={8}
                style={styles.stepBtn}
              >
                <Feather name="minus" size={15} color={colors.textPrimary} />
              </Pressable>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600", minWidth: 24, textAlign: "center" }}>
                {interval}
              </Text>
              <Pressable
                onPress={() => onChange({ ...value, repeat: rule, repeatInterval: clampInterval(interval + 1) })}
                hitSlop={8}
                style={styles.stepBtn}
              >
                <Feather name="plus" size={15} color={colors.textPrimary} />
              </Pressable>
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "500", minWidth: 48 }}>
              {interval === 1
                ? UNIT_OPTIONS.find((u) => u.value === rule)?.singular
                : UNIT_OPTIONS.find((u) => u.value === rule)?.plural}
            </Text>
          </View>

          {rule === "weekly" && (
            <View style={styles.dayRow}>
              {WEEKDAY_OPTIONS.map((d) => {
                const on = weeklyDays.includes(d.value);
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => toggleDay(d.value)}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: on ? colors.accent : colors.glass,
                        borderColor: on ? colors.accent : colors.glassBorder,
                      },
                    ]}
                  >
                    <Text style={{ color: on ? colors.surface0 : colors.textPrimary, fontSize: 12, fontWeight: "600" }}>
                      {d.short}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Ends — forever / until / times in one block */}
          <View style={[styles.endsCard, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
            <View style={styles.endSeg}>
              {(
                [
                  { id: "never" as const, label: "Forever" },
                  { id: "on" as const, label: "Until" },
                  { id: "after" as const, label: "Times" },
                ] as const
              ).map((opt) => {
                const on = end === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setEnd(opt.id)}
                    style={[
                      styles.endChip,
                      {
                        borderColor: on ? colors.accent : "transparent",
                        backgroundColor: on ? colors.accentSoft : "transparent",
                      },
                    ]}
                  >
                    <Text style={{ color: on ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {end === "on" && (
              <Pressable onPress={onPickUntil} style={styles.endsExtra} hitSlop={4}>
                <Feather name="calendar" size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>
                  {value.repeatUntil
                    ? value.repeatUntil.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Pick a date"}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.textSecondary} />
              </Pressable>
            )}

            {end === "after" && (
              <View style={styles.endsExtra}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>Stop after</Text>
                <View style={[styles.stepper, { borderColor: colors.glassBorder, backgroundColor: colors.surface0 }]}>
                  <Pressable
                    onPress={() =>
                      onChange({ ...value, repeat: rule, repeatEnd: "after", repeatCount: Math.max(1, count - 1) })
                    }
                    hitSlop={8}
                    style={styles.stepBtn}
                  >
                    <Feather name="minus" size={15} color={colors.textPrimary} />
                  </Pressable>
                  <TextInput
                    value={String(count)}
                    keyboardType="number-pad"
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/\D/g, ""), 10);
                      onChange({
                        ...value,
                        repeat: rule,
                        repeatEnd: "after",
                        repeatCount: Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1,
                      });
                    }}
                    style={{
                      color: colors.textPrimary,
                      fontSize: 15,
                      fontWeight: "600",
                      minWidth: 28,
                      textAlign: "center",
                      padding: 0,
                    }}
                  />
                  <Pressable
                    onPress={() =>
                      onChange({
                        ...value,
                        repeat: rule,
                        repeatEnd: "after",
                        repeatCount: Math.min(999, count + 1),
                      })
                    }
                    hitSlop={8}
                    style={styles.stepBtn}
                  >
                    <Feather name="plus" size={15} color={colors.textPrimary} />
                  </Pressable>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13 }}>times</Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 15, fontWeight: "600" },
  unitRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  unitChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
  },
  stepBtn: { padding: 8 },
  dayRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  endSeg: { flexDirection: "row", gap: 4 },
  endChip: {
    flex: 1,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  endsCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
    gap: 6,
  },
  endsExtra: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
});
