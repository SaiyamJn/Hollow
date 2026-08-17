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

/** Hollow rhythm panel — interval, weekdays, and how the series ends. */
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

  function bumpInterval(delta: number) {
    if (!active) return;
    onChange({ ...value, repeat: rule, repeatInterval: clampInterval(interval + delta) });
  }

  function toggleDay(day: number) {
    const set = new Set(weeklyDays);
    if (set.has(day)) {
      if (set.size <= 1) return;
      set.delete(day);
    } else set.add(day);
    onChange({
      ...value,
      repeat: "weekly",
      repeatDays: [...set].sort((a, b) => a - b),
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

  const summary = formatRepeatLabel({
    rule: value.repeat,
    days: value.repeatDays,
    interval: value.repeatInterval,
    end: value.repeatEnd,
    until: value.repeatUntil,
    count: value.repeatCount,
  });

  return (
    <View>
      <Text style={[styles.kicker, { color: colors.textSecondary }]}>Rhythm</Text>
      <Text style={[styles.summary, { color: colors.textPrimary }]}>{summary}</Text>

      <Pressable
        onPress={() => setRule(null)}
        style={[
          styles.offRow,
          {
            borderColor: !active ? colors.accent : colors.glassBorder,
            backgroundColor: !active ? colors.accentSoft : colors.glass,
          },
        ]}
      >
        <Feather name="slash" size={14} color={!active ? colors.accent : colors.textSecondary} />
        <Text style={{ color: !active ? colors.accent : colors.textPrimary, fontSize: 14, flex: 1, fontWeight: !active ? "600" : "400" }}>
          Doesn't repeat
        </Text>
        {!active && <Feather name="check" size={16} color={colors.accent} />}
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Repeats every</Text>
      <View style={styles.everyRow}>
        <View style={[styles.stepper, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
          <Pressable onPress={() => bumpInterval(-1)} hitSlop={8} style={styles.stepBtn}>
            <Feather name="minus" size={16} color={active ? colors.textPrimary : colors.textSecondary} />
          </Pressable>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "600", minWidth: 28, textAlign: "center" }}>
            {interval}
          </Text>
          <Pressable onPress={() => bumpInterval(1)} hitSlop={8} style={styles.stepBtn}>
            <Feather name="plus" size={16} color={active ? colors.textPrimary : colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.unitRow}>
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
                <Text style={{ color: on ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: on ? "600" : "500" }}>
                  {interval === 1 ? u.singular : u.plural}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {active && rule === "weekly" && (
        <View style={{ marginTop: 14 }}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>On these days</Text>
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
        </View>
      )}

      {active && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>Begins</Text>
          <View style={[styles.field, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
            <Feather name="sunrise" size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>
              {due
                ? due.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" })
                : "Pick a due date first"}
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>Keeps going</Text>
          {(
            [
              { id: "never" as const, label: "Forever", hint: "No end in sight" },
              { id: "on" as const, label: "Until a day", hint: "Stop on a date" },
              { id: "after" as const, label: "A set number", hint: "Then call it done" },
            ] as const
          ).map((opt) => {
            const on = end === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setEnd(opt.id)}
                style={[
                  styles.endRow,
                  {
                    borderColor: on ? colors.accent : colors.glassBorder,
                    backgroundColor: on ? colors.accentSoft : colors.glass,
                  },
                ]}
              >
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: on ? colors.accent : colors.textSecondary,
                      backgroundColor: on ? colors.accent : "transparent",
                    },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: on ? colors.accent : colors.textPrimary, fontSize: 14, fontWeight: on ? "600" : "400" }}>
                    {opt.label}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>{opt.hint}</Text>
                </View>
                {opt.id === "on" && on && (
                  <Pressable onPress={onPickUntil} hitSlop={6}>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
                      {value.repeatUntil
                        ? value.repeatUntil.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : "Pick date"}
                    </Text>
                  </Pressable>
                )}
                {opt.id === "after" && on && (
                  <View style={styles.countWrap}>
                    <Pressable
                      onPress={() =>
                        onChange({
                          ...value,
                          repeat: rule,
                          repeatEnd: "after",
                          repeatCount: Math.max(1, count - 1),
                        })
                      }
                      hitSlop={6}
                    >
                      <Feather name="minus" size={14} color={colors.textPrimary} />
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
                      style={[styles.countInput, { color: colors.textPrimary, borderColor: colors.glassBorder }]}
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
                      hitSlop={6}
                    >
                      <Feather name="plus" size={14} color={colors.textPrimary} />
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summary: { fontSize: 15, fontWeight: "600", marginBottom: 14 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  offRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  everyRow: { gap: 10 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  stepBtn: { padding: 8 },
  unitRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  unitChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dayRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  endRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  countWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  countInput: {
    minWidth: 40,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
});
