import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
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
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { updateAccount } from "../lib/api";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { AccountAvatar } from "../components/AccountAvatar";
import { useLayout } from "../lib/layout";

function apiError(err: any, fallback: string): string {
  const fromApi = err?.response?.data?.error;
  if (typeof fromApi === "string" && fromApi) return fromApi;
  if (err?.code === "ECONNABORTED") return "Request timed out — check your connection.";
  if (!err?.response) return "Couldn't reach the server";
  return fallback;
}

export default function AccountScreen() {
  const { colors } = useTheme();
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance } = useLayout();

  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setUsername(user.username);
    setEmail(user.email);
  }, [user?.id, user?.name, user?.username, user?.email]);

  const inputStyle = [styles.value, { color: colors.textPrimary }];

  async function onSave() {
    if (!user) return;
    setError(null);

    const patch: {
      name?: string;
      username?: string;
      email?: string;
    } = {};

    if (name.trim() !== user.name) patch.name = name.trim();
    if (username.trim().toLowerCase() !== user.username) patch.username = username.trim();
    if (email.trim().toLowerCase() !== user.email) patch.email = email.trim();

    if (!patch.name && !patch.username && !patch.email) {
      setError("Nothing to update.");
      return;
    }

    setBusy(true);
    try {
      const res = await updateAccount(patch);
      await updateUser(res.user);
      void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
      Alert.alert(
        "Account saved",
        res.revoked === 0
          ? "This device stays signed in."
          : `Signed out ${res.revoked} other device${res.revoked === 1 ? "" : "s"}.`
      );
    } catch (err: any) {
      setError(apiError(err, "Couldn't update account."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardSafe
      scroll
      style={{ flex: 1, backgroundColor: colors.surface0 }}
      contentContainerStyle={{ padding: screenPad, paddingBottom: stackBottomClearance(false) }}
    >
      <View style={styles.hero}>
        <AccountAvatar name={user?.name} colors={colors} />
        <Text
          style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "500", marginTop: 12, letterSpacing: -0.3 }}
          numberOfLines={1}
        >
          {user?.name ?? "—"}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, textAlign: "center" }}>
          {user?.username ? `@${user.username}` : ""}
          {user?.username && user?.email ? "  ·  " : ""}
          {user?.email ?? ""}
        </Text>
      </View>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>PROFILE</Text>
      <GlassCard contentStyle={{ paddingVertical: 4, paddingBottom: 12 }}>
        <Field label="Display name" colors={colors}>
          <TextInput
            style={inputStyle}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            maxLength={80}
            placeholder="Display name"
            placeholderTextColor={colors.textSecondary}
          />
        </Field>
        <Field label="Username" colors={colors}>
          <TextInput
            style={inputStyle}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            maxLength={32}
            placeholder="Username"
            placeholderTextColor={colors.textSecondary}
          />
        </Field>
        <Field label="Email" colors={colors} last>
          <TextInput
            style={inputStyle}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
          />
        </Field>
        {error ? (
          <Text style={{ color: colors.danger, fontSize: 13, textAlign: "center", marginTop: 8, paddingHorizontal: 14 }}>
            {error}
          </Text>
        ) : (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              textAlign: "center",
              marginTop: 8,
              paddingHorizontal: 14,
              lineHeight: 17,
            }}
          >
            Saving signs out every other device. This one stays signed in.
          </Text>
        )}
        <Pressable
          onPress={() => void onSave()}
          disabled={busy}
          style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
        >
          <Text style={{ color: colors.surface0, fontWeight: "500" }}>{busy ? "Saving…" : "Save changes"}</Text>
        </Pressable>
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>PASSWORD</Text>
      <Pressable onPress={() => setPasswordOpen(true)}>
        <GlassCard contentStyle={[styles.actionRow]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>Change password</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              Other devices will be signed out
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </GlassCard>
      </Pressable>

      <ChangePasswordModal
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onSaved={(revoked) => {
          void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
          Alert.alert(
            "Password updated",
            revoked === 0
              ? "This device stays signed in."
              : `Signed out ${revoked} other device${revoked === 1 ? "" : "s"}.`
          );
        }}
      />
    </KeyboardSafe>
  );
}

function ChangePasswordModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (revoked: number) => void;
}) {
  const { colors } = useTheme();
  const { updateUser } = useAuth();
  const { isNarrow } = useLayout();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }, [visible]);

  async function handleSubmit() {
    setError(null);
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don’t match.");
      return;
    }

    setBusy(true);
    try {
      const res = await updateAccount({ currentPassword, newPassword });
      await updateUser(res.user);
      onClose();
      onSaved(res.revoked);
    } catch (err: any) {
      setError(apiError(err, "Couldn't change password."));
    } finally {
      setBusy(false);
    }
  }

  const padH = isNarrow ? 16 : 28;
  const topInset = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0, 28);
  const padTop = topInset + 24;
  const padBottom = Math.max(insets.bottom, 16) + 16;
  const maxCardH = Math.max(240, height - padTop - padBottom);
  const inputStyle = [
    styles.modalInput,
    { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.textPrimary },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.modalOverlay,
          { paddingHorizontal: padH, paddingTop: padTop, paddingBottom: padBottom },
        ]}
      >
        <GlassCard
          strong
          style={{ width: "100%", maxWidth: 400, alignSelf: "center", maxHeight: maxCardH }}
          contentStyle={{ padding: 20, maxHeight: maxCardH }}
        >
          <ScrollView
            style={{ maxHeight: maxCardH - 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "500", marginBottom: 14 }}>
              Change password
            </Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Current password</Text>
            <TextInput
              style={inputStyle}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="Current password"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>New password</Text>
            <TextInput
              style={inputStyle}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoComplete="password-new"
              placeholder="Min 8 characters"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Re-enter new password</Text>
            <TextInput
              style={inputStyle}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="password-new"
              placeholder="Re-enter new password"
              placeholderTextColor={colors.textSecondary}
              onSubmitEditing={() => void handleSubmit()}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
              Other devices will be signed out. This one stays signed in.
            </Text>
            {error ? <Text style={styles.modalError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={styles.modalBtn} disabled={busy}>
                <Text style={{ color: colors.textSecondary, fontWeight: "500" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSubmit()}
                disabled={busy}
                style={[styles.modalBtn, { backgroundColor: colors.accent, borderRadius: 12, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.surface0, fontWeight: "500" }}>{busy ? "…" : "Update"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  children,
  last,
  colors,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
  colors: { border: string; textSecondary: string };
}) {
  return (
    <View
      style={[
        styles.field,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginBottom: 4 }}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 20,
  },
  groupHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  field: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: {
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 2,
  },
  button: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  actionRow: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  modalError: { color: "#f87171", fontSize: 13, marginTop: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 16 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 8 },
});
