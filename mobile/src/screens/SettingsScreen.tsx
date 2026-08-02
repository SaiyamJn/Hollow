import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { API_URL, fetchHealth } from "../lib/api";
import {
  APP_BUILD,
  APP_COPYRIGHT,
  APP_NAME,
  APP_PLATFORM,
  APP_TAGLINE,
  APP_VERSION,
} from "../lib/appInfo";
import { getNotificationsEnabled, setNotificationsEnabled, syncTaskReminders } from "../lib/notifications";
import type { Task } from "../lib/types";
import { GlassCard } from "../components/GlassCard";

function DetailRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { textPrimary: string; textSecondary: string; border: string };
}) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "500", textAlign: "right", flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors, theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const [notifOn, setNotifOn] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    void getNotificationsEnabled().then(setNotifOn);
  }, []);

  async function toggleNotifications(next: boolean) {
    const effective = await setNotificationsEnabled(next);
    setNotifOn(effective);
    if (next && !effective) {
      Alert.alert("Notifications blocked", "Enable notifications for Hollow in your device settings.");
    }
    if (effective) {
      await syncTaskReminders(queryClient.getQueryData<Task[]>(["tasks"]));
    }
  }

  const serverLabel = health?.ok
    ? `${health.name ?? "Hollow"} ${health.version ?? "—"}`
    : health === undefined
      ? "Checking…"
      : "Unavailable";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface0 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
    >
      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>ACCOUNT</Text>
      <GlassCard contentStyle={[styles.card, styles.centered]}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500", textAlign: "center" }}>
          {user?.name ?? "—"}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, textAlign: "center" }}>
          {user?.email ?? ""}
        </Text>
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>APPEARANCE</Text>
      <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Dark theme</Text>
        <Switch
          value={theme === "dark"}
          onValueChange={toggle}
          trackColor={{ true: colors.accent, false: colors.surface2 }}
          thumbColor={colors.surface0}
        />
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>NOTIFICATIONS</Text>
      <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Task reminders</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
            Get notified when a task with a due time is due
          </Text>
        </View>
        <Switch
          value={notifOn}
          onValueChange={(v) => void toggleNotifications(v)}
          trackColor={{ true: colors.accent, false: colors.surface2 }}
          thumbColor={colors.surface0}
        />
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>SERVER</Text>
      <GlassCard contentStyle={[styles.card, styles.centered]}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>{API_URL}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, textAlign: "center" }}>
          Override with EXPO_PUBLIC_API_URL in mobile/.env
        </Text>
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>ABOUT</Text>
      <GlassCard contentStyle={[styles.card, styles.centered]}>
        <View style={[styles.mark, { backgroundColor: colors.accent }]} />
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "500", marginTop: 10 }}>{APP_NAME}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, textAlign: "center" }}>
          {APP_TAGLINE}
        </Text>
        <View style={{ alignSelf: "stretch", marginTop: 14 }}>
          <DetailRow label="Version" value={APP_VERSION} colors={colors} />
          <DetailRow label="Build" value={String(APP_BUILD)} colors={colors} />
          <DetailRow label="Client" value={APP_PLATFORM} colors={colors} />
          <DetailRow label="Server" value={serverLabel} colors={colors} />
          <DetailRow label="Encryption" value="AES-256-GCM at rest" colors={colors} />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 12, textAlign: "center" }}>
          {APP_COPYRIGHT}
        </Text>
      </GlassCard>

      <Pressable
        onPress={() => {
          unlock.clearAll();
          void logout();
        }}
        style={{ marginTop: 24 }}
      >
        <GlassCard contentStyle={[styles.card, styles.centered]}>
          <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "500", textAlign: "center" }}>Log out</Text>
        </GlassCard>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  groupHeader: { fontSize: 11, fontWeight: "500", letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  card: { padding: 14 },
  centered: { alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mark: { height: 10, width: 10, borderRadius: 5 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
