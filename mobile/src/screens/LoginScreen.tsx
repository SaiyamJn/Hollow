import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { GlassCard } from "../components/GlassCard";
import { BrandMark } from "../components/BrandMark";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { API_URL } from "../lib/api";
import { useLayout } from "../lib/layout";

function authErrorMessage(err: any): string {
  const fromApi = err?.response?.data?.error;
  if (typeof fromApi === "string" && fromApi) return fromApi;
  if (err?.code === "ECONNABORTED") return "Request timed out — check the API URL.";
  if (!err?.response) return `Couldn't reach ${API_URL}`;
  return "Couldn't sign in";
}

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const { colors } = useTheme();
  const { isNarrow } = useLayout();
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
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardSafe
      scroll
      style={{ backgroundColor: colors.surface0 }}
      contentContainerStyle={[styles.container, { padding: isNarrow ? 16 : 24 }]}
    >
      <GlassCard
        strong
        style={{ width: "100%", maxWidth: 420, alignSelf: "center" }}
        contentStyle={[styles.card, isNarrow && { padding: 18 }]}
      >
        <BrandMark size="lg" wordmark style={{ marginBottom: 4 }} />
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
        <Text style={[styles.apiHint, { color: colors.textSecondary }]} selectable numberOfLines={2}>
          API: {API_URL}
        </Text>
      </GlassCard>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center" },
  card: { padding: 24 },
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
  apiHint: { fontSize: 11, marginTop: 16, textAlign: "center", opacity: 0.75 },
});
