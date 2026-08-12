import { useEffect, useState } from "react";
import {
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../contexts/theme";
import type { TaskRepeatRule } from "../lib/types";
import { GlassCard } from "./GlassCard";
import { GlassDateTimePicker, formatDueLabel } from "./GlassDateTimePicker";

export type TaskDraft = {
  title: string;
  description: string;
  due: Date | null;
  repeat: TaskRepeatRule | null;
};

const REPEAT_OPTIONS: { value: TaskRepeatRule | null; label: string }[] = [
  { value: null, label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function formatRepeatLabel(rule: TaskRepeatRule | null | undefined) {
  if (!rule) return "Does not repeat";
  const hit = REPEAT_OPTIONS.find((o) => o.value === rule);
  return hit?.label ?? rule;
}

function overlayPads(insets: { top: number; bottom: number }, height: number) {
  const topInset = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0, 28);
  const padTop = topInset + 16;
  const padBottom = Math.max(insets.bottom, 16) + 12;
  const maxCardH = Math.max(240, height - padTop - padBottom);
  return { padTop, padBottom, maxCardH };
}

export function TaskFormModal({
  visible,
  title,
  submitLabel,
  draft,
  busy,
  autoFocus = false,
  onClose,
  onChange,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  submitLabel: string;
  draft: TaskDraft | null;
  busy: boolean;
  autoFocus?: boolean;
  onClose: () => void;
  onChange: (next: TaskDraft | null) => void;
  onSubmit: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [dueOpen, setDueOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [dueDraft, setDueDraft] = useState<Date | null>(null);

  useEffect(() => {
    if (!visible) {
      setDueOpen(false);
      setRepeatOpen(false);
    }
  }, [visible]);

  if (!draft) return null;
  const current = draft;
  const { padTop, padBottom, maxCardH } = overlayPads(insets, height);

  function openDuePicker() {
    const initial = current.due ?? (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    setDueDraft(initial);
    setDueOpen(true);
  }

  function confirmDue() {
    onChange({
      ...current,
      due: dueDraft,
      repeat: dueDraft ? current.repeat : null,
    });
    setDueOpen(false);
  }

  function clearDue() {
    onChange({ ...current, due: null, repeat: null });
    setDueOpen(false);
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.overlay, { paddingTop: padTop, paddingBottom: padBottom, paddingHorizontal: 16 }]}
        >
          <GlassCard
            strong
            style={{ maxHeight: maxCardH, width: "100%", overflow: "hidden" }}
            contentStyle={[styles.card, { maxHeight: maxCardH }]}
          >
            <ScrollView
              style={{ maxHeight: maxCardH - 8 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets
              bounces={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <Text style={[styles.heading, { color: colors.textPrimary }]}>{title}</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.glassBorder,
                    backgroundColor: colors.glass,
                  },
                ]}
                placeholder="Title"
                placeholderTextColor={colors.textSecondary}
                value={current.title}
                onChangeText={(nextTitle) => onChange({ ...current, title: nextTitle })}
                autoFocus={autoFocus}
              />
              <TextInput
                style={[
                  styles.input,
                  styles.desc,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.glassBorder,
                    backgroundColor: colors.glass,
                  },
                ]}
                placeholder="Details"
                placeholderTextColor={colors.textSecondary}
                value={current.description}
                onChangeText={(description) => onChange({ ...current, description })}
                multiline
              />

              <Pressable
                onPress={openDuePicker}
                style={[styles.rowBtn, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
                hitSlop={6}
              >
                <Feather name="calendar" size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                  {current.due ? formatDueLabel(current.due) : "Add date/time"}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.textSecondary} />
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!current.due) openDuePicker();
                  else setRepeatOpen(true);
                }}
                style={[styles.rowBtn, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
                hitSlop={6}
              >
                <Feather name="repeat" size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                  {current.due ? formatRepeatLabel(current.repeat) : "Repeat (needs a date)"}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.textSecondary} />
              </Pressable>

              <View style={styles.actions}>
                <Pressable onPress={onClose}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
                </Pressable>
                <Pressable disabled={!current.title.trim() || busy} onPress={onSubmit}>
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>{submitLabel}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </GlassCard>
        </KeyboardAvoidingView>
      </Modal>

      {/* Separate compact popup — sibling Modal so it stacks cleanly over the form */}
      <Modal
        visible={visible && dueOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDueOpen(false)}
      >
        <View style={[styles.overlay, { paddingTop: padTop, paddingBottom: padBottom, paddingHorizontal: 16 }]}>
          <GlassCard
            strong
            style={{ maxHeight: maxCardH, width: "100%", maxWidth: 400, alignSelf: "center", overflow: "hidden" }}
            contentStyle={[styles.card, { maxHeight: maxCardH }]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              <Text style={[styles.heading, { color: colors.textPrimary }]}>Date & time</Text>
              <GlassDateTimePicker value={dueDraft} onChange={setDueDraft} />
              <View style={[styles.actions, { marginTop: 12 }]}>
                <Pressable onPress={clearDue}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Remove</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 20 }}>
                  <Pressable onPress={() => setDueOpen(false)}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={confirmDue}>
                    <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </GlassCard>
        </View>
      </Modal>

      <Modal
        visible={visible && repeatOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRepeatOpen(false)}
      >
        <View style={[styles.overlay, { paddingTop: padTop, paddingBottom: padBottom, paddingHorizontal: 16 }]}>
          <GlassCard
            strong
            style={{ width: "100%", maxWidth: 400, alignSelf: "center" }}
            contentStyle={styles.card}
          >
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Repeat</Text>
            {REPEAT_OPTIONS.map((opt) => {
              const selected = (current.repeat ?? null) === opt.value;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    onChange({ ...current, repeat: opt.value });
                    setRepeatOpen(false);
                  }}
                  style={[
                    styles.repeatOption,
                    {
                      borderColor: selected ? colors.accent : colors.glassBorder,
                      backgroundColor: selected ? colors.accentSoft : colors.glass,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? colors.accent : colors.textPrimary,
                      fontSize: 14,
                      fontWeight: selected ? "600" : "400",
                      flex: 1,
                    }}
                  >
                    {opt.label}
                  </Text>
                  {selected && <Feather name="check" size={16} color={colors.accent} />}
                </Pressable>
              );
            })}
            <Pressable onPress={() => setRepeatOpen(false)} style={{ alignSelf: "flex-end", marginTop: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
            </Pressable>
          </GlassCard>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
  },
  card: { padding: 20 },
  heading: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 12,
    textAlign: "left",
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    textAlign: "left",
  },
  desc: { minHeight: 72, textAlignVertical: "top" },
  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  repeatOption: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
});
