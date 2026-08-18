import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import { useFont } from "../contexts/font";
import {
  defaultFocusColor,
  FOCUS_COLOR_PRESETS,
  normalizeHex,
  useFocusColors,
  type FocusCategory,
} from "../contexts/focusColors";
import { useUnlock } from "../contexts/unlock";
import { fetchHealth, fetchTasks } from "../lib/api";
import {
  APP_BUILD,
  APP_COPYRIGHT,
  APP_NAME,
  APP_PLATFORM,
  APP_TAGLINE,
  APP_VERSION,
} from "../lib/appInfo";
import { FONT_OPTIONS } from "../lib/fonts";
import { FOCUS_MATRIX, FOCUS_META } from "../lib/taskFocus";
import { getNotificationsEnabled, setNotificationsEnabled, syncTaskReminders } from "../lib/notifications";
import type { Task } from "../lib/types";
import { BrandMark } from "../components/BrandMark";
import { GlassCard } from "../components/GlassCard";
import { useLayout } from "../lib/layout";
import { AccountAvatar } from "../components/AccountAvatar";

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

export default function SettingsScreen({ navigation }: any) {
  const { colors, theme, toggle } = useTheme();
  const { font, setFont } = useFont();
  const { colorFor, setCategoryColor, resetAll, isCustom } = useFocusColors();
  const { user, logout } = useAuth();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance } = useLayout();
  const [notifOn, setNotifOn] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [editingFocus, setEditingFocus] = useState<FocusCategory | null>(null);
  const [hexDraft, setHexDraft] = useState("");

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
      const cached = queryClient.getQueryData<Task[]>(["tasks"]);
      const tasks = cached ?? (await queryClient.fetchQuery({ queryKey: ["tasks"], queryFn: fetchTasks }));
      await syncTaskReminders(tasks);
    }
  }

  const serverLabel = health?.ok
    ? `${health.name ?? "Hollow"} ${health.version ?? "—"}`
    : health === undefined
      ? "Checking…"
      : "Unavailable";

  const activeFont = FONT_OPTIONS.find((o) => o.id === font) ?? FONT_OPTIONS[0];

  function openFocusEditor(id: FocusCategory) {
    setEditingFocus(id);
    setHexDraft(colorFor(id) ?? defaultFocusColor(id, theme));
  }

  function applyHex() {
    if (!editingFocus) return;
    const normalized = normalizeHex(hexDraft);
    if (!normalized) {
      Alert.alert("Invalid color", "Enter a hex like #0d8a68 or 0d8a68.");
      return;
    }
    setCategoryColor(editingFocus, normalized);
    setHexDraft(normalized);
  }

  function pickPreset(hex: string) {
    if (!editingFocus) return;
    setCategoryColor(editingFocus, hex);
    setHexDraft(hex);
  }

  function resetCategory() {
    if (!editingFocus) return;
    setCategoryColor(editingFocus, null);
    setHexDraft(defaultFocusColor(editingFocus, theme));
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface0 }}
      contentContainerStyle={{ padding: screenPad, paddingBottom: stackBottomClearance(false) }}
    >
      <Text style={[styles.groupHeader, { color: colors.accent }]}>ACCOUNT</Text>
      <Pressable onPress={() => navigation.navigate("Account")}>
        <GlassCard contentStyle={[styles.card, styles.centered]}>
          <AccountAvatar name={user?.name} size={52} colors={colors} />
          <Text
            style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "500", marginTop: 12, textAlign: "center" }}
            numberOfLines={1}
          >
            {user?.name ?? "—"}
          </Text>
          {!!user?.username && (
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 3, textAlign: "center" }} numberOfLines={1}>
              @{user.username}
            </Text>
          )}
          {!!user?.email && (
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, textAlign: "center" }} numberOfLines={2}>
              {user.email}
            </Text>
          )}
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "500", marginTop: 12 }}>Edit</Text>
        </GlassCard>
      </Pressable>

      <Pressable onPress={() => navigation.navigate("Devices")} style={{ marginTop: 10 }}>
        <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>
              Devices
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              Peek at where you're signed in — kick a device if you need to
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 18 }}>›</Text>
        </GlassCard>
      </Pressable>

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

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>FOCUS COLORS</Text>
      <Pressable
        onPress={() => {
          setEditingFocus(null);
          setFocusOpen(true);
        }}
      >
        <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
          <View style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>Focus colors</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
              Now, Anchor, Nudge, Later
            </Text>
          </View>
          <View style={styles.swatchPreview}>
            {(FOCUS_MATRIX as FocusCategory[]).map((id) => (
              <View
                key={id}
                style={[
                  styles.miniSwatch,
                  {
                    backgroundColor: colorFor(id) ?? defaultFocusColor(id, theme),
                    borderColor: colors.border,
                  },
                ]}
              />
            ))}
          </View>
          <Feather name="chevron-down" size={18} color={colors.textSecondary} />
        </GlassCard>
      </Pressable>

      <Modal
        visible={focusOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setFocusOpen(false);
          setEditingFocus(null);
        }}
      >
        <Pressable
          style={styles.fontOverlay}
          onPress={() => {
            setFocusOpen(false);
            setEditingFocus(null);
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.fontSheet, { backgroundColor: colors.surface1, borderColor: colors.border }]}
          >
            {editingFocus ? (
              <>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: 16,
                    fontWeight: "600",
                    marginBottom: 4,
                    textAlign: "center",
                  }}
                >
                  {FOCUS_META[editingFocus].label} color
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    textAlign: "center",
                    marginBottom: 14,
                  }}
                >
                  Pick a swatch or enter a hex
                </Text>

                <View
                  style={[
                    styles.previewRow,
                    { borderColor: colors.border, backgroundColor: colors.surface0 },
                  ]}
                >
                  <View
                    style={[
                      styles.previewSwatch,
                      {
                        backgroundColor: normalizeHex(hexDraft) ?? colorFor(editingFocus) ?? "#888",
                        borderColor: colors.border,
                      },
                    ]}
                  />
                  <TextInput
                    value={hexDraft}
                    onChangeText={setHexDraft}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="#0d8a68"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.hexInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    onSubmitEditing={applyHex}
                  />
                  <Pressable
                    onPress={applyHex}
                    style={[styles.hexApply, { backgroundColor: colors.accentSoft }]}
                  >
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>Apply</Text>
                  </Pressable>
                </View>

                <View style={styles.presetGrid}>
                  {FOCUS_COLOR_PRESETS.map((hex) => {
                    const active = (normalizeHex(hexDraft) ?? "").toLowerCase() === hex.toLowerCase();
                    return (
                      <Pressable
                        key={hex}
                        onPress={() => pickPreset(hex)}
                        style={[
                          styles.presetSwatch,
                          {
                            backgroundColor: hex,
                            borderColor: active ? colors.textPrimary : colors.border,
                            borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      />
                    );
                  })}
                </View>

                <View style={styles.colorActions}>
                  <Pressable onPress={resetCategory} style={{ paddingVertical: 12, flex: 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}>
                      Use default
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setEditingFocus(null)} style={{ paddingVertical: 12, flex: 1 }}>
                    <Text
                      style={{ color: colors.accent, fontSize: 14, fontWeight: "700", textAlign: "center" }}
                    >
                      Done
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: 16,
                    fontWeight: "600",
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  Focus colors
                </Text>
                {(FOCUS_MATRIX as FocusCategory[]).map((id, i) => {
                  const tint = colorFor(id) ?? defaultFocusColor(id, theme);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => openFocusEditor(id)}
                      style={[
                        styles.focusRow,
                        i < FOCUS_MATRIX.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={[styles.focusSwatch, { backgroundColor: tint, borderColor: colors.border }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>
                          {FOCUS_META[id].label}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {isCustom(id) ? tint : `${FOCUS_META[id].hint} · default`}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                    </Pressable>
                  );
                })}
                <Pressable onPress={resetAll} style={{ paddingVertical: 14 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>
                    Reset to defaults
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>FONT</Text>
      <Pressable onPress={() => setFontOpen(true)}>
        <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
          <View style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>Typeface</Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                marginTop: 2,
                fontFamily: activeFont?.id === "system" ? undefined : `${activeFont?.id}-regular`,
              }}
              numberOfLines={1}
            >
              {activeFont?.label ?? "Sora"}
              {activeFont?.sample ? ` · ${activeFont.sample.replace(/^Aa · /, "")}` : ""}
            </Text>
          </View>
          <Feather name="chevron-down" size={18} color={colors.textSecondary} />
        </GlassCard>
      </Pressable>

      <Modal visible={fontOpen} transparent animationType="fade" onRequestClose={() => setFontOpen(false)}>
        <Pressable style={styles.fontOverlay} onPress={() => setFontOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.fontSheet, { backgroundColor: colors.surface1, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "600", marginBottom: 8, textAlign: "center" }}>
              Choose a font
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {FONT_OPTIONS.map((opt, i) => {
                const active = font === opt.id;
                const face = opt.id === "system" ? undefined : `${opt.id}-regular`;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      setFont(opt.id);
                      setFontOpen(false);
                    }}
                    style={[
                      styles.fontRow,
                      i < FONT_OPTIONS.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
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
                    {active && <Feather name="check" size={16} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>NOTIFICATIONS</Text>
      <GlassCard contentStyle={[styles.card, styles.rowBetween]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>Task reminders</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
            A gentle nudge when something's due — undated ones ping once when you add them.
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
  groupHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  card: { padding: 14 },
  centered: { alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  swatchPreview: { flexDirection: "row", alignItems: "center", gap: 5, marginRight: 8 },
  miniSwatch: {
    width: 14,
    height: 14,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fontRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fontOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  fontSheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingBottom: 8,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  focusSwatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewSwatch: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hexInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  hexApply: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  presetSwatch: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  colorActions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.25)",
    marginTop: 8,
  },
});
