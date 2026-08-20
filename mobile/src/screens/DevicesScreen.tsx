import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import {
  fetchAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
} from "../lib/api";
import type { AuthSession } from "../lib/types";
import { ConfirmModal } from "../components/ConfirmModal";
import { GlassCard } from "../components/GlassCard";
import { useLayout } from "../lib/layout";

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function platformIcon(platform: string): keyof typeof Feather.glyphMap {
  const p = platform.toLowerCase();
  if (p === "ios") return "smartphone";
  if (p === "android") return "smartphone";
  if (p === "web") return "monitor";
  return "tablet";
}

function SessionRow({
  session,
  busy,
  last,
  onSignOut,
}: {
  session: AuthSession;
  busy: boolean;
  last?: boolean;
  onSignOut: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.border },
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
        <Feather name={platformIcon(session.platform)} size={16} color={colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500", flexShrink: 1 }}
            numberOfLines={1}
          >
            {session.deviceName}
          </Text>
          {session.current && (
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "600" }}>This device</Text>
            </View>
          )}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          Active {relativeTime(session.lastSeenAt)} · signed in {relativeTime(session.createdAt)}
        </Text>
      </View>
      <Pressable onPress={onSignOut} disabled={busy} hitSlop={8} style={{ padding: 6, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "500" }}>
          {session.current ? "Log out" : "Sign out"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function DevicesScreen() {
  const { colors } = useTheme();
  const { logout } = useAuth();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance } = useLayout();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: fetchAuthSessions,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
  }, [queryClient]);

  const [confirm, setConfirm] = useState<
    | { kind: "one"; session: AuthSession }
    | { kind: "others" }
    | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);

  const revokeOne = useMutation({
    mutationFn: revokeAuthSession,
    onSuccess: async (res) => {
      if (res.current) {
        unlock.clearAll();
        await logout({ localOnly: true });
        return;
      }
      invalidate();
    },
    onError: (err: any) => {
      Alert.alert("Couldn't sign out", err?.response?.data?.error ?? "Try again.");
    },
  });

  const revokeOthers = useMutation({
    mutationFn: revokeOtherAuthSessions,
    onSuccess: (res) => {
      invalidate();
      setNotice(
        res.revoked === 0
          ? "No other devices were signed in."
          : `Signed out ${res.revoked} other device${res.revoked === 1 ? "" : "s"}.`
      );
    },
    onError: (err: any) => {
      Alert.alert("Couldn't sign out others", err?.response?.data?.error ?? "Try again.");
    },
  });

  const sessions = data ?? [];
  const others = sessions.filter((s) => !s.current).length;
  const busy = revokeOne.isPending || revokeOthers.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface0 }}
      contentContainerStyle={{ padding: screenPad, paddingBottom: stackBottomClearance(false) }}
      refreshControl={
        <RefreshControl refreshing={isRefetching && !isLoading} onRefresh={() => void refetch()} tintColor={colors.accent} />
      }
    >
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
        See where your account is signed in. Signing out a device ends that session right away.
      </Text>

      <GlassCard contentStyle={{ paddingVertical: 4 }}>
        {isLoading && !data ? (
          <View style={{ padding: 24, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.danger, fontSize: 13, textAlign: "center" }}>
              Couldn't load devices. Pull to refresh — or re-login if the server was just updated.
            </Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>
              No active sessions.
            </Text>
          </View>
        ) : (
          sessions.map((session, index) => (
            <SessionRow
              key={session.id}
              session={session}
              busy={busy}
              last={index === sessions.length - 1}
              onSignOut={() => setConfirm({ kind: "one", session })}
            />
          ))
        )}
      </GlassCard>

      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 10, marginBottom: 18 }}>
        {sessions.length === 0
          ? "—"
          : `${sessions.length} device${sessions.length === 1 ? "" : "s"} signed in`}
      </Text>

      {notice ? (
        <Text style={{ color: colors.accent, fontSize: 13, textAlign: "center", marginBottom: 12 }}>
          {notice}
        </Text>
      ) : null}

      {others > 0 && (
        <Pressable onPress={() => setConfirm({ kind: "others" })} disabled={busy} style={{ opacity: busy ? 0.55 : 1 }}>
          <GlassCard contentStyle={[styles.actionCard]}>
            <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "500", textAlign: "center" }}>
              Sign out of {others} other device{others === 1 ? "" : "s"}
            </Text>
          </GlassCard>
        </Pressable>
      )}
    </ScrollView>
      <ConfirmModal
        visible={confirm !== null}
        title={
          confirm?.kind === "others"
            ? "Sign out other devices?"
            : confirm?.session.current
              ? "Log out of this device?"
              : "Sign out this device?"
        }
        message={
          confirm?.kind === "others"
            ? "Every other phone, tablet, or browser signed into this account will be signed out. This device stays signed in."
            : confirm?.session.current
              ? "You'll need to sign in again on this phone."
              : `${confirm?.session.deviceName ?? "This device"} will be signed out immediately.`
        }
        confirmLabel={
          confirm?.kind === "others"
            ? "Sign out others"
            : confirm?.session.current
              ? "Log out"
              : "Sign out"
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === "others") revokeOthers.mutate();
          else if (confirm?.kind === "one") revokeOne.mutate(confirm.session.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  actionCard: { padding: 14, alignItems: "center" },
});
