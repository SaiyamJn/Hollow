import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { GlassCard } from "../components/GlassCard";

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { backgroundColor: colors.surface0 }]}
    >
      <GlassCard strong contentStyle={styles.card}>
        <Text style={[styles.logo, { color: colors.textPrimary }]}>Hollow</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign in to your notes</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder="Email or username"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          value={identifier}
          onChangeText={setIdentifier}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={onSubmit}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
          onPress={onSubmit}
          disabled={busy}
        >
          <Text style={{ color: colors.surface0, fontWeight: "500" }}>{busy ? "Signing in…" : "Sign in"}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Register")} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            No account? <Text style={{ color: colors.accent }}>Register</Text>
          </Text>
        </Pressable>
      </GlassCard>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  card: { padding: 24 },
  logo: { fontSize: 20, fontWeight: "500" },
  subtitle: { fontSize: 13, marginTop: 2, marginBottom: 18 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  error: { color: "#f87171", fontSize: 13, marginBottom: 10 },
  button: { borderRadius: 12, alignItems: "center", paddingVertical: 11, marginTop: 4 },
});
