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
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/theme";
import { useLayout } from "../lib/layout";
import { GlassCard } from "./GlassCard";

export type ManageClassesModalProps = {
  visible: boolean;
  classes: string[];
  defaultClass: string;
  onClose: () => void;
  onSaveOrder: (classes: string[], defaultClass?: string) => Promise<any> | any;
  onRenameClass: (oldName: string, newName: string) => Promise<any> | any;
  onDeleteClass: (name: string) => Promise<any> | any;
};

export function ManageClassesModal({
  visible,
  classes,
  defaultClass,
  onClose,
  onSaveOrder,
  onRenameClass,
  onDeleteClass,
}: ManageClassesModalProps) {
  const { colors } = useTheme();
  const { isNarrow } = useLayout();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [currentClasses, setCurrentClasses] = useState<string[]>(classes);
  const [curDefault, setCurDefault] = useState<string>(defaultClass);
  const [newClassName, setNewClassName] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrentClasses(classes);
    setCurDefault(defaultClass);
    setEditingIndex(null);
    setConfirmDelete(null);
  }, [classes, defaultClass, visible]);

  async function moveClass(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentClasses.length) return;
    const next = [...currentClasses];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setCurrentClasses(next);
    try {
      await onSaveOrder(next, curDefault);
    } catch {}
  }

  async function toggleDefault(name: string) {
    const next = curDefault.toLowerCase() === name.toLowerCase() ? "" : name;
    setCurDefault(next);
    try {
      await onSaveOrder(currentClasses, next);
    } catch {}
  }

  async function handleAdd() {
    const trimmed = newClassName.trim();
    if (!trimmed) return;
    if (currentClasses.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewClassName("");
      return;
    }
    const next = [...currentClasses, trimmed];
    setCurrentClasses(next);
    setNewClassName("");
    try {
      await onSaveOrder(next, curDefault);
    } catch {}
  }

  async function handleRename(oldName: string) {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingIndex(null);
      return;
    }
    setBusy(true);
    try {
      await onRenameClass(oldName, trimmed);
      const next = currentClasses.map((c) => (c === oldName ? trimmed : c));
      setCurrentClasses(next);
      if (curDefault === oldName) setCurDefault(trimmed);
      setEditingIndex(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(name: string) {
    setBusy(true);
    try {
      await onDeleteClass(name);
      const next = currentClasses.filter((c) => c !== name);
      setCurrentClasses(next);
      if (curDefault === name) setCurDefault("");
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  const padH = isNarrow ? 16 : 28;
  const topInset = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0, 28);
  const padTop = topInset + 16;
  const padBottom = Math.max(insets.bottom, 16) + 16;
  const maxCardH = Math.max(260, height - padTop - padBottom);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.overlay,
          {
            paddingHorizontal: padH,
            paddingTop: padTop,
            paddingBottom: padBottom,
          },
        ]}
      >
        <GlassCard
          strong
          style={{ width: "100%", maxWidth: 440, alignSelf: "center", maxHeight: maxCardH }}
          contentStyle={[styles.card, { maxHeight: maxCardH }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Manage Classes</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Reorder, rename, delete, or choose a default class.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Delete confirmation banner */}
          {confirmDelete && (
            <View style={[styles.deleteBanner, { backgroundColor: `${colors.danger}18`, borderColor: `${colors.danger}40` }]}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger }}>
                Delete class &ldquo;{confirmDelete}&rdquo;?
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                Tasks won&apos;t be deleted, but will have this class cleared.
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Pressable
                  onPress={() => setConfirmDelete(null)}
                  style={[styles.smallBtn, { backgroundColor: colors.surface2 }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(confirmDelete)}
                  disabled={busy}
                  style={[styles.smallBtn, { backgroundColor: colors.danger }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>
                    {busy ? "Deleting…" : "Delete"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Classes list */}
          <ScrollView
            style={{ maxHeight: maxCardH - 170 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {currentClasses.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  No classes yet. Add one below.
                </Text>
              </View>
            ) : (
              currentClasses.map((cls, idx) => {
                const isDef = curDefault.toLowerCase() === cls.toLowerCase();
                const isEditing = editingIndex === idx;

                return (
                  <View
                    key={cls}
                    style={[
                      styles.row,
                      {
                        backgroundColor: colors.surface2,
                        borderColor: isDef ? `${colors.accent}40` : "transparent",
                      },
                    ]}
                  >
                    {/* Up / Down reorder arrows */}
                    <View style={styles.reorderCol}>
                      <Pressable
                        onPress={() => moveClass(idx, "up")}
                        disabled={idx === 0}
                        hitSlop={4}
                        style={{ opacity: idx === 0 ? 0.2 : 0.8 }}
                      >
                        <Feather name="chevron-up" size={14} color={colors.textPrimary} />
                      </Pressable>
                      <Pressable
                        onPress={() => moveClass(idx, "down")}
                        disabled={idx === currentClasses.length - 1}
                        hitSlop={4}
                        style={{ opacity: idx === currentClasses.length - 1 ? 0.2 : 0.8 }}
                      >
                        <Feather name="chevron-down" size={14} color={colors.textPrimary} />
                      </Pressable>
                    </View>

                    {/* Class name or inline edit */}
                    <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8 }}>
                      {isEditing ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <TextInput
                            autoFocus
                            value={editingValue}
                            onChangeText={setEditingValue}
                            style={[
                              styles.inlineInput,
                              {
                                color: colors.textPrimary,
                                borderColor: colors.accent,
                                backgroundColor: colors.glass,
                              },
                            ]}
                          />
                          <Pressable
                            onPress={() => handleRename(cls)}
                            disabled={busy}
                            hitSlop={4}
                            style={[styles.actionIcon, { backgroundColor: colors.accentSoft }]}
                          >
                            <Feather name="check" size={14} color={colors.accent} />
                          </Pressable>
                          <Pressable
                            onPress={() => setEditingIndex(null)}
                            hitSlop={4}
                            style={styles.actionIcon}
                          >
                            <Feather name="x" size={14} color={colors.textSecondary} />
                          </Pressable>
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 13, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 }}
                          >
                            {cls}
                          </Text>
                          {isDef && (
                            <View style={[styles.defaultBadge, { backgroundColor: colors.accentSoft }]}>
                              <Text style={{ fontSize: 9, fontWeight: "700", color: colors.accent, letterSpacing: 0.5 }}>
                                DEFAULT
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>

                    {/* Action buttons: default star, edit, delete */}
                    {!isEditing && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Pressable
                          onPress={() => toggleDefault(cls)}
                          hitSlop={6}
                          style={styles.actionIcon}
                        >
                          <Feather
                            name="star"
                            size={14}
                            color={isDef ? colors.accent : colors.textSecondary}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setEditingIndex(idx);
                            setEditingValue(cls);
                          }}
                          hitSlop={6}
                          style={styles.actionIcon}
                        >
                          <Feather name="edit-2" size={13} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmDelete(cls)}
                          hitSlop={6}
                          style={styles.actionIcon}
                        >
                          <Feather name="trash-2" size={13} color={colors.danger} />
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Add class footer */}
          <View style={[styles.addFooter, { borderTopColor: colors.glassBorder }]}>
            <TextInput
              value={newClassName}
              onChangeText={setNewClassName}
              placeholder="Add new class…"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.addInput,
                { color: colors.textPrimary, borderColor: colors.glassBorder, backgroundColor: colors.glass },
              ]}
            />
            <Pressable
              onPress={handleAdd}
              disabled={!newClassName.trim()}
              style={[
                styles.addBtn,
                {
                  backgroundColor: colors.accent,
                  opacity: newClassName.trim() ? 1 : 0.4,
                },
              ]}
            >
              <Feather name="plus" size={16} color={colors.surface0} />
            </Pressable>
          </View>

          {/* Done button */}
          <Pressable
            onPress={onClose}
            style={[styles.doneBtn, { backgroundColor: colors.surface2 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textPrimary }}>
              Done
            </Text>
          </Pressable>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
  },
  card: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  deleteBanner: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reorderCol: {
    flexDirection: "column",
    gap: 2,
    alignItems: "center",
  },
  inlineInput: {
    flex: 1,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 12,
  },
  actionIcon: {
    padding: 5,
    borderRadius: 6,
  },
  defaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  addFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  addInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
});
