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
  return "Couldn't create account";
}

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const { colors } = useTheme();
  const { isNarrow } = useLayout();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await register(email.trim(), password, name.trim(), username.trim());
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
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Create an account</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder="Display name"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder="Username"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder="Password (min 8 characters)"
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
          <Text style={{ color: colors.surface0, fontWeight: "500" }}>{busy ? "Creating…" : "Create account"}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Login")} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Have an account? <Text style={{ color: colors.accent }}>Sign in</Text>
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
