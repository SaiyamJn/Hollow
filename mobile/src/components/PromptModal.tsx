import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../contexts/theme";

interface PromptModalProps {
  visible: boolean;
  title: string;
  placeholder: string;
  secure?: boolean;
  submitLabel?: string;
  onClose: () => void;
  /** Return null on success (closes the modal) or an error message to show. */
  onSubmit: (value: string) => Promise<string | null>;
}

// Cross-platform replacement for iOS-only Alert.prompt: used for new
// notebook/section/page titles and lock/unlock passwords.
export function PromptModal({ visible, title, placeholder, secure, submitLabel = "OK", onClose, onSubmit }: PromptModalProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue("");
      setError(null);
    }
  }, [visible]);

  async function handleSubmit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    const result = await onSubmit(value.trim());
    setBusy(false);
    if (result) setError(result);
    else onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.textPrimary }]}
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
            <Pressable onPress={handleSubmit} style={[styles.button, { backgroundColor: colors.accent, borderRadius: 12 }]}>
              <Text style={{ color: colors.surface0, fontWeight: "500" }}>{busy ? "…" : submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 28 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 20 },
  title: { fontSize: 15, fontWeight: "500", marginBottom: 14 },
  input: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  error: { color: "#f87171", fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  button: { paddingHorizontal: 16, paddingVertical: 8 },
});
