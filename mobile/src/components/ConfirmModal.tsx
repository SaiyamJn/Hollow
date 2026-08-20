import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/theme";
import { useLayout } from "../lib/layout";
import { GlassCard } from "./GlassCard";

export type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

/** In-app confirm sheet — used instead of the system Alert prompt. */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const { colors } = useTheme();
  const { isNarrow } = useLayout();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setBusy(false);
  }, [visible]);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const padH = isNarrow ? 16 : 28;
  const topInset = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0, 28);
  const padTop = topInset + 24;
  const padBottom = Math.max(insets.bottom, 16) + 16;
  const maxCardH = Math.max(200, height - padTop - padBottom);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.overlay,
          {
            paddingHorizontal: padH,
            paddingTop: padTop,
            paddingBottom: padBottom,
          },
        ]}
      >
        <GlassCard
          strong
          style={{ width: "100%", maxWidth: 400, alignSelf: "center", maxHeight: maxCardH }}
          contentStyle={[styles.card, { maxHeight: maxCardH }]}
        >
          <ScrollView
            style={{ maxHeight: maxCardH - 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.button} disabled={busy}>
                <Text style={{ color: colors.textSecondary, fontWeight: "500" }}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleConfirm()}
                disabled={busy}
                style={[styles.button, { backgroundColor: colors.accentSoft, borderRadius: 12 }]}
              >
                <Text
                  style={{
                    color: destructive ? colors.danger : colors.accent,
                    fontWeight: "600",
                  }}
                >
                  {busy ? "…" : confirmLabel}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
  },
  card: { padding: 20 },
  title: { fontSize: 15, fontWeight: "500", marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 16 },
  button: { paddingHorizontal: 16, paddingVertical: 8 },
});
