import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusColors } from "../contexts/focusColors";
import { FOCUS_MATRIX, FOCUS_META, normalizeFocus, type TaskFocus } from "../lib/taskFocus";
import type { ThemeColors } from "../theme";

/** Compact list-row signal. */
export function FocusDot({
  focus,
  colors,
  size = 7,
}: {
  focus: TaskFocus | string | null | undefined;
  colors: ThemeColors;
  size?: number;
}) {
  const { colorFor } = useFocusColors();
  const id = normalizeFocus(focus);
  if (id === "none") return null;
  const c = colorFor(id);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: c ?? colors.textSecondary,
      }}
    />
  );
}

/**
 * Mobile “compass” — 2×2 focus matrix with axis labels.
 * Creative but still glass / Hollow: Important ↑, Urgent →.
 */
export function FocusCompass({
  value,
  colors,
  onChange,
}: {
  value: TaskFocus | string | null | undefined;
  colors: ThemeColors;
  onChange: (next: TaskFocus) => void;
}) {
  const { colorFor, washFor } = useFocusColors();
  const current = normalizeFocus(value);

  return (
    <View style={styles.wrap}>
      <View style={styles.axisRow}>
        <Text style={[styles.axisLabel, { color: colors.textSecondary }]}>urgent →</Text>
        <Text style={[styles.axisLabel, { color: colors.textSecondary, textAlign: "right" }]}>
          ← not urgent
        </Text>
      </View>

      <View style={styles.matrixRow}>
        <Text
          style={[
            styles.sideLabel,
            { color: colors.textSecondary, transform: [{ rotate: "-90deg" }] },
          ]}
        >
          important
        </Text>
        <View style={styles.grid}>
          {FOCUS_MATRIX.map((id) => {
            const meta = FOCUS_META[id];
            const active = current === id;
            const tint = colorFor(id);
            const wash = washFor(id);
            return (
              <Pressable
                key={id}
                onPress={() => onChange(active ? "none" : id)}
                style={[
                  styles.cell,
                  {
                    borderColor: active ? tint || colors.accent : colors.border,
                    backgroundColor: wash,
                    borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: tint ?? colors.textSecondary }]} />
                <Text style={{ color: tint || colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
                  {meta.label}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }} numberOfLines={2}>
                  {meta.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() => onChange("none")}
        hitSlop={8}
        style={[styles.clearBtn, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>
          {current === "none" ? "No focus signal" : "Clear focus"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  axisRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 18,
    gap: 6,
  },
  axisLabel: { flex: 1, fontSize: 10, letterSpacing: 0.2 },
  matrixRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  sideLabel: {
    width: 16,
    fontSize: 10,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  grid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cell: {
    width: "47%",
    flexGrow: 1,
    minWidth: "45%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 999, marginBottom: 4 },
  clearBtn: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
