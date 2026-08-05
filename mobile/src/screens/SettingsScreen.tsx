import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { useFont } from "../contexts/font";
import { useUnlock } from "../contexts/unlock";
import { fetchHealth } from "../lib/api";
import {
  APP_BUILD,
  APP_COPYRIGHT,
  APP_NAME,
  APP_PLATFORM,
  APP_TAGLINE,
  APP_VERSION,
} from "../lib/appInfo";
import { FONT_OPTIONS } from "../lib/fonts";
import { getNotificationsEnabled, setNotificationsEnabled, syncTaskReminders } from "../lib/notifications";
import type { Task } from "../lib/types";
import { BrandMark } from "../components/BrandMark";
import { GlassCard } from "../components/GlassCard";
import { useLayout } from "../lib/layout";

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
      <Text style={{ color: colors.textSecondary, fontSize: 13, flexShrink: 0 }}>{label}</Text>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: 13,
          fontWeight: "500",
          textAlign: "right",
          flex: 1,
          minWidth: 0,
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors, theme, toggle } = useTheme();
  const { font, setFont } = useFont();
  const { user, logout } = useAuth();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance } = useLayout();
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
      contentContainerStyle={{ padding: screenPad, paddingBottom: stackBottomClearance(false) }}
    >
      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>ACCOUNT</Text>
      <GlassCard contentStyle={[styles.card, styles.centered]}>
        <Text
          style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500", textAlign: "center" }}
          numberOfLines={1}
        >
          {user?.name ?? "—"}
        </Text>
        {!!user?.username && (
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, textAlign: "center" }} numberOfLines={1}>
            @{user.username}
          </Text>
        )}
        {!!user?.email && (
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, textAlign: "center" }} numberOfLines={2}>
            {user.email}
          </Text>
        )}
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>APPEARANCE</Text>
      <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1, flexShrink: 1, paddingRight: 12 }}>
          Dark theme
        </Text>
        <Switch
          value={theme === "dark"}
          onValueChange={toggle}
          trackColor={{ true: colors.accent, false: colors.surface2 }}
          thumbColor={colors.surface0}
        />
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>FONT</Text>
      <GlassCard contentStyle={{ paddingVertical: 4 }}>
        {FONT_OPTIONS.map((opt, i) => {
          const active = font === opt.id;
          const face = opt.id === "system" ? undefined : `${opt.id}-regular`;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setFont(opt.id)}
              style={[
                styles.fontRow,
                i < FONT_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                active && { backgroundColor: colors.accentSoft },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500", fontFamily: face }}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2, fontFamily: face }}
                  numberOfLines={1}
                >
                  {opt.sample}
                </Text>
              </View>
              {active && <Text style={{ color: colors.accent, fontSize: 13 }}>✓</Text>}
            </Pressable>
          );
        })}
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>NOTIFICATIONS</Text>
      <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Task reminders</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
            Notify at each task’s due date/time. Tasks without a due date notify once when added.
          </Text>
        </View>
        <Switch
          value={notifOn}
          onValueChange={(v) => void toggleNotifications(v)}
          trackColor={{ true: colors.accent, false: colors.surface2 }}
          thumbColor={colors.surface0}
        />
      </GlassCard>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>ABOUT</Text>
      <GlassCard contentStyle={[styles.card, styles.centered]}>
        <BrandMark size="xl" />
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "500", marginTop: 12 }}>{APP_NAME}</Text>
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
  fontRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
