import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../contexts/theme";
import { GlassCard } from "./GlassCard";
import type { ReminderPrompt } from "../lib/notifications";

export function TaskReminderModal({
  prompt,
  busy,
  onComplete,
  onSnooze,
  onDismiss,
}: {
  prompt: ReminderPrompt | null;
  busy?: boolean;
  onComplete: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  if (!prompt) return null;

  const heading =
    prompt.kind === "overdue" ? "Task overdue" : prompt.kind === "due" ? "Task due" : "Reminder";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.wrap}>
          <GlassCard strong contentStyle={styles.card}>
            <Text style={[styles.kicker, { color: colors.accent }]}>{heading}</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{prompt.title}</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Complete it now, or I’ll nudge you again in an hour.
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={onSnooze}
                disabled={busy}
                style={[styles.btn, { borderColor: colors.border, opacity: busy ? 0.55 : 1 }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: "500", fontSize: 14 }}>Remind later</Text>
              </Pressable>
              <Pressable
                onPress={onComplete}
                disabled={busy}
                style={[styles.btn, { backgroundColor: colors.accent, opacity: busy ? 0.55 : 1 }]}
              >
                <Text style={{ color: colors.surface0, fontWeight: "500", fontSize: 14 }}>
                  {busy ? "…" : "Complete"}
                </Text>
              </Pressable>
            </View>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  wrap: { width: "100%", maxWidth: 400, alignSelf: "center" },
  card: { padding: 20 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  hint: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
});
