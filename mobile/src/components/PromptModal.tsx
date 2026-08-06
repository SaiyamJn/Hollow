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
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/theme";
import { useLayout } from "../lib/layout";
import { GlassCard } from "./GlassCard";

interface PromptModalProps {
  visible: boolean;
  title: string;
  placeholder: string;
  secure?: boolean;
  submitLabel?: string;
  /** Prefill when opening (e.g. rename / edit). */
  initialValue?: string;
  onClose: () => void;
  /** Return null on success (closes the modal) or an error message to show. */
  onSubmit: (value: string) => Promise<string | null>;
}

// Cross-platform replacement for iOS-only Alert.prompt: used for new
// notebook/section/page titles and lock/unlock passwords.
export function PromptModal({
  visible,
  title,
  placeholder,
  secure,
  submitLabel = "OK",
  initialValue = "",
  onClose,
  onSubmit,
}: PromptModalProps) {
  const { colors } = useTheme();
  const { isNarrow } = useLayout();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setError(null);
    }
  }, [visible, initialValue]);

  async function handleSubmit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    const result = await onSubmit(value.trim());
    setBusy(false);
    if (result) setError(result);
    else onClose();
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
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={3}>
              {title}
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary },
              ]}
              placeholder={placeholder}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={secure}
              autoFocus
              value={value}
              onChangeText={setValue}
              onSubmitEditing={handleSubmit}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.button}>
                <Text style={{ color: colors.textSecondary, fontWeight: "500" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                style={[styles.button, { backgroundColor: colors.accent, borderRadius: 12 }]}
              >
                <Text style={{ color: colors.surface0, fontWeight: "500" }}>{busy ? "…" : submitLabel}</Text>
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
  title: { fontSize: 15, fontWeight: "500", marginBottom: 14 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  error: { color: "#f87171", fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 16 },
  button: { paddingHorizontal: 16, paddingVertical: 8 },
});
