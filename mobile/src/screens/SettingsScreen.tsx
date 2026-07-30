import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { API_URL } from "../lib/api";
import { getNotificationsEnabled, setNotificationsEnabled, syncTaskReminders } from "../lib/notifications";
import type { Task } from "../lib/types";

export default function SettingsScreen() {
  const { colors, theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const [notifOn, setNotifOn] = useState(false);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0, padding: 16 }}>
      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>ACCOUNT</Text>
      <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>{user?.name ?? "—"}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{user?.email ?? ""}</Text>
      </View>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>APPEARANCE</Text>
      <View style={[styles.card, styles.rowBetween, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Dark theme</Text>
        <Switch
          value={theme === "dark"}
          onValueChange={toggle}
          trackColor={{ true: colors.accent, false: colors.surface2 }}
          thumbColor={colors.surface0}
        />
      </View>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>NOTIFICATIONS</Text>
      <View style={[styles.card, styles.rowBetween, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Task reminders</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            Get notified when a task with a due time is due
          </Text>
        </View>
        <Switch
          value={notifOn}
          onValueChange={(v) => void toggleNotifications(v)}
          trackColor={{ true: colors.accent, false: colors.surface2 }}
          thumbColor={colors.surface0}
        />
      </View>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>SERVER</Text>
      <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{API_URL}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
          Override with EXPO_PUBLIC_API_URL in mobile/.env
        </Text>
      </View>

      <Pressable
        onPress={() => {
          unlock.clearAll();
          void logout();
        }}
        style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.border, marginTop: 24 }]}
      >
        <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "500" }}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  groupHeader: { fontSize: 11, fontWeight: "500", letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
