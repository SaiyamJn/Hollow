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
import {
  clampInterval,
  defaultWeeklyDays,
  formatRepeatLabel,
  normalizeRepeatDays,
  normalizeRepeatEnd,
  type RepeatEnd,
} from "../lib/taskRepeat";
import { GlassCard } from "./GlassCard";
import { GlassDateTimePicker, formatDueLabel } from "./GlassDateTimePicker";
import { RepeatPanel } from "./RepeatPanel";

export type TaskDraft = {
  title: string;
  description: string;
  due: Date | null;
  repeat: TaskRepeatRule | null;
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: RepeatEnd | null;
  repeatUntil?: Date | null;
  repeatCount?: number | null;
};

export { formatRepeatLabel };

export function repeatPayload(draft: TaskDraft) {
  if (!draft.due || !draft.repeat) {
    return {
      repeatRule: null as TaskRepeatRule | null,
      repeatDays: null as number[] | null,
      repeatInterval: 1,
      repeatEnd: null as RepeatEnd | null,
      repeatUntil: null as string | null,
      repeatCount: null as number | null,
    };
  }
  const end = normalizeRepeatEnd(draft.repeatEnd);
  return {
    repeatRule: draft.repeat,
    repeatDays: draft.repeat === "weekly" ? normalizeRepeatDays(draft.repeatDays) ?? defaultWeeklyDays(draft.due) : null,
    repeatInterval: clampInterval(draft.repeatInterval ?? 1),
    repeatEnd: end,
    repeatUntil: end === "on" && draft.repeatUntil ? draft.repeatUntil.toISOString() : null,
    repeatCount: end === "after" ? Math.min(999, Math.max(1, Math.floor(draft.repeatCount ?? 30))) : null,
  };
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
  const [untilOpen, setUntilOpen] = useState(false);
  const [dueDraft, setDueDraft] = useState<Date | null>(null);
  const [untilDraft, setUntilDraft] = useState<Date | null>(null);

  useEffect(() => {
    if (!visible) {
      setDueOpen(false);
      setRepeatOpen(false);
      setUntilOpen(false);
    }
  }, [visible]);

  if (!draft) return null;
  const current = draft;
  const { padTop, padBottom, maxCardH } = overlayPads(insets, height);

  function openDuePicker() {
    const initial =
      current.due ??
      (() => {
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
      repeatDays: dueDraft && current.repeat === "weekly" ? current.repeatDays ?? defaultWeeklyDays(dueDraft) : null,
      repeatInterval: dueDraft ? current.repeatInterval ?? 1 : 1,
      repeatEnd: dueDraft ? current.repeatEnd : null,
      repeatUntil: dueDraft ? current.repeatUntil : null,
      repeatCount: dueDraft ? current.repeatCount : null,
    });
    setDueOpen(false);
  }

  function clearDue() {
    onChange({
      ...current,
      due: null,
      repeat: null,
      repeatDays: null,
      repeatInterval: 1,
      repeatEnd: null,
      repeatUntil: null,
      repeatCount: null,
    });
    setDueOpen(false);
  }

  function openUntilPicker() {
    const initial =
      current.repeatUntil ??
      (() => {
        const d = current.due ? new Date(current.due) : new Date();
        d.setMonth(d.getMonth() + 1);
        d.setHours(0, 0, 0, 0);
        return d;
      })();
    setUntilDraft(initial);
    setUntilOpen(true);
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
            style={{ maxHeight: maxCardH, width: "100%", maxWidth: 440, alignSelf: "center", overflow: "hidden" }}
            contentStyle={[styles.card, { maxHeight: maxCardH }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.heading, { color: colors.textPrimary }]}>{title}</Text>
              <TextInput
                autoFocus={autoFocus}
                value={current.title}
                onChangeText={(titleText) => onChange({ ...current, title: titleText })}
                placeholder="What's the plan?"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
              />
              <TextInput
                value={current.description}
                onChangeText={(description) => onChange({ ...current, description })}
                placeholder="A little context, if you like"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[
                  styles.input,
                  styles.desc,
                  { color: colors.textPrimary, borderColor: colors.glassBorder, backgroundColor: colors.glass },
                ]}
              />

              <Pressable
                onPress={openDuePicker}
                style={[styles.rowBtn, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
                hitSlop={6}
              >
                <Feather name="calendar" size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                  {current.due ? formatDueLabel(current.due) : "When is it due?"}
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
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={2}>
                  {current.due
                    ? formatRepeatLabel({
                        rule: current.repeat,
                        days: current.repeatDays,
                        interval: current.repeatInterval,
                        end: current.repeatEnd,
                        until: current.repeatUntil,
                        count: current.repeatCount,
                      })
                    : "Repeat (pick a date first)"}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.textSecondary} />
              </Pressable>

              <View style={styles.actions}>
                <Pressable onPress={onClose}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Never mind</Text>
                </Pressable>
                <Pressable disabled={!current.title.trim() || busy} onPress={onSubmit}>
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>{submitLabel}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </GlassCard>
        </KeyboardAvoidingView>
      </Modal>

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
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Clear</Text>
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
            <RepeatPanel
              due={current.due}
              value={current}
              onChange={(next) => onChange({ ...current, ...next })}
              onPickUntil={openUntilPicker}
            />
            <Pressable
              onPress={() => setRepeatOpen(false)}
              style={{ alignSelf: "flex-end", marginTop: 14 }}
            >
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>Done</Text>
            </Pressable>
          </GlassCard>
        </View>
      </Modal>

      <Modal
        visible={visible && untilOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUntilOpen(false)}
      >
        <View style={[styles.overlay, { paddingTop: padTop, paddingBottom: padBottom, paddingHorizontal: 16 }]}>
          <GlassCard
            strong
            style={{ maxHeight: maxCardH, width: "100%", maxWidth: 400, alignSelf: "center", overflow: "hidden" }}
            contentStyle={[styles.card, { maxHeight: maxCardH }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.heading, { color: colors.textPrimary }]}>Last day</Text>
              <GlassDateTimePicker value={untilDraft} onChange={setUntilDraft} />
              <View style={[styles.actions, { marginTop: 12 }]}>
                <Pressable onPress={() => setUntilOpen(false)}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onChange({
                      ...current,
                      repeatEnd: "on",
                      repeatUntil: untilDraft,
                      repeatCount: null,
                    });
                    setUntilOpen(false);
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>Done</Text>
                </Pressable>
              </View>
            </ScrollView>
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
});
