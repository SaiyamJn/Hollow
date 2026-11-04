import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/theme";
import { useLayout } from "../lib/layout";
import { GlassCard } from "./GlassCard";

const ROW_STEP = 54;

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

  // Drag-and-drop state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const dragScale = useRef(new Animated.Value(1)).current;

  const draggingIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const currentClassesRef = useRef<string[]>(currentClasses);
  currentClassesRef.current = currentClasses;
  const curDefaultRef = useRef<string>(curDefault);
  curDefaultRef.current = curDefault;

  useEffect(() => {
    setCurrentClasses(classes);
    setCurDefault(defaultClass);
    setEditingIndex(null);
    setConfirmDelete(null);
    setDraggingIndex(null);
    setHoverIndex(null);
    draggingIndexRef.current = null;
    hoverIndexRef.current = null;
  }, [classes, defaultClass, visible]);

  function moveClass(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    if (fromIdx >= currentClasses.length || toIdx >= currentClasses.length) return;
    const next = [...currentClasses];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setCurrentClasses(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void onSaveOrder(next, curDefault);
  }

  function startDrag(idx: number) {
    if (editingIndex !== null || currentClasses.length <= 1) return;
    draggingIndexRef.current = idx;
    hoverIndexRef.current = idx;
    setDraggingIndex(idx);
    setHoverIndex(idx);
    dragY.setValue(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(dragScale, {
      toValue: 1.03,
      useNativeDriver: true,
      friction: 7,
      tension: 130,
    }).start();
  }

  function onDragMove(dy: number) {
    if (draggingIndexRef.current === null) return;
    dragY.setValue(dy);
    const fromIdx = draggingIndexRef.current;
    const diff = Math.round(dy / ROW_STEP);
    const targetIdx = Math.max(0, Math.min(currentClassesRef.current.length - 1, fromIdx + diff));

    if (targetIdx !== hoverIndexRef.current) {
      hoverIndexRef.current = targetIdx;
      setHoverIndex(targetIdx);
      void Haptics.selectionAsync();
    }
  }

  function endDrag() {
    const fromIdx = draggingIndexRef.current;
    const toIdx = hoverIndexRef.current;

    Animated.spring(dragScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();

    if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx) {
      const next = [...currentClassesRef.current];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setCurrentClasses(next);
      void onSaveOrder(next, curDefaultRef.current);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    draggingIndexRef.current = null;
    hoverIndexRef.current = null;
    setDraggingIndex(null);
    setHoverIndex(null);
    dragY.setValue(0);
  }

  async function toggleDefault(name: string) {
    const next = curDefault.toLowerCase() === name.toLowerCase() ? "" : name;
    setCurDefault(next);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    // If no default exists yet, automatically set first added class as default
    const nextDef = curDefault ? curDefault : trimmed;
    setCurrentClasses(next);
    setCurDefault(nextDef);
    setNewClassName("");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await onSaveOrder(next, nextDef);
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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setBusy(false);
    }
  }

  const padH = isNarrow ? 16 : 28;
  const topInset = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0, 28);
  const padTop = topInset + 16;
  const padBottom = Math.max(insets.bottom, 16) + 16;
  const maxCardH = Math.max(280, height - padTop - padBottom);

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
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Manage Classes</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Hold handle to drag or use ↑↓ · Tap ★ to set default for new tasks
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
            scrollEnabled={draggingIndex === null}
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
                const isDragging = draggingIndex === idx;

                let offsetY = 0;
                if (draggingIndex !== null && hoverIndex !== null && !isDragging) {
                  if (draggingIndex < hoverIndex) {
                    if (idx > draggingIndex && idx <= hoverIndex) {
                      offsetY = -ROW_STEP;
                    }
                  } else if (draggingIndex > hoverIndex) {
                    if (idx >= hoverIndex && idx < draggingIndex) {
                      offsetY = ROW_STEP;
                    }
                  }
                }

                return (
                  <ClassRowItem
                    key={cls}
                    cls={cls}
                    idx={idx}
                    total={currentClasses.length}
                    isDef={isDef}
                    isEditing={isEditing}
                    isDragging={isDragging}
                    offsetY={offsetY}
                    dragY={dragY}
                    dragScale={dragScale}
                    onStartDrag={startDrag}
                    onMoveDrag={onDragMove}
                    onEndDrag={endDrag}
                    onMoveUp={() => moveClass(idx, idx - 1)}
                    onMoveDown={() => moveClass(idx, idx + 1)}
                    onToggleDefault={() => toggleDefault(cls)}
                    onStartEdit={() => {
                      setEditingIndex(idx);
                      setEditingValue(cls);
                    }}
                    onConfirmDelete={() => setConfirmDelete(cls)}
                    editingValue={editingValue}
                    setEditingValue={setEditingValue}
                    onRename={() => handleRename(cls)}
                    onCancelEdit={() => setEditingIndex(null)}
                    busy={busy}
                    colors={colors}
                  />
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
              onSubmitEditing={handleAdd}
              returnKeyType="done"
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

function ClassRowItem({
  cls,
  idx,
  total,
  isDef,
  isEditing,
  isDragging,
  offsetY,
  dragY,
  dragScale,
  onStartDrag,
  onMoveDrag,
  onEndDrag,
  onMoveUp,
  onMoveDown,
  onToggleDefault,
  onStartEdit,
  onConfirmDelete,
  editingValue,
  setEditingValue,
  onRename,
  onCancelEdit,
  busy,
  colors,
}: {
  cls: string;
  idx: number;
  total: number;
  isDef: boolean;
  isEditing: boolean;
  isDragging: boolean;
  offsetY: number;
  dragY: Animated.Value;
  dragScale: Animated.Value;
  onStartDrag: (idx: number) => void;
  onMoveDrag: (dy: number) => void;
  onEndDrag: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleDefault: () => void;
  onStartEdit: () => void;
  onConfirmDelete: () => void;
  editingValue: string;
  setEditingValue: (v: string) => void;
  onRename: () => void;
  onCancelEdit: () => void;
  busy: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const dragHandlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        onStartDrag(idx);
      },
      onPanResponderMove: (_, g) => {
        onMoveDrag(g.dy);
      },
      onPanResponderRelease: () => {
        onEndDrag();
      },
      onPanResponderTerminate: () => {
        onEndDrag();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.row,
        {
          backgroundColor: isDragging ? colors.surface1 : colors.surface2,
          borderColor: isDragging
            ? colors.accent
            : isDef
              ? `${colors.accent}55`
              : colors.glassBorder,
          zIndex: isDragging ? 999 : 1,
          elevation: isDragging ? 8 : 0,
          shadowColor: isDragging ? "#000" : "transparent",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDragging ? 0.35 : 0,
          shadowRadius: 8,
          transform: isDragging
            ? [{ translateY: dragY }, { scale: dragScale }]
            : [{ translateY: offsetY }],
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingVertical: 4 }}>
        {/* Drag handle */}
        {!isEditing && (
          <View
            {...dragHandlers.panHandlers}
            style={styles.dragHandle}
            hitSlop={8}
            accessibilityLabel={`Drag to rearrange ${cls}`}
          >
            <Feather
              name="menu"
              size={16}
              color={isDragging ? colors.accent : colors.textSecondary}
            />
          </View>
        )}

        {/* Quick up/down reorder buttons */}
        {!isEditing && total > 1 && (
          <View style={{ flexDirection: "column", gap: 1, marginRight: 6 }}>
            <Pressable
              onPress={onMoveUp}
              disabled={idx === 0}
              hitSlop={4}
              style={{ opacity: idx === 0 ? 0.2 : 0.8, padding: 1 }}
            >
              <Feather name="chevron-up" size={13} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onMoveDown}
              disabled={idx === total - 1}
              hitSlop={4}
              style={{ opacity: idx === total - 1 ? 0.2 : 0.8, padding: 1 }}
            >
              <Feather name="chevron-down" size={13} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* Class name or inline edit */}
        <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
          {isEditing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                autoFocus
                value={editingValue}
                onChangeText={setEditingValue}
                onSubmitEditing={onRename}
                returnKeyType="done"
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
                onPress={onRename}
                disabled={busy}
                hitSlop={4}
                style={[styles.actionIcon, { backgroundColor: colors.accentSoft }]}
              >
                <Feather name="check" size={14} color={colors.accent} />
              </Pressable>
              <Pressable onPress={onCancelEdit} hitSlop={4} style={styles.actionIcon}>
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

        {/* Actions: default star, rename, delete */}
        {!isEditing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 8 }}>
            <Pressable
              onPress={onToggleDefault}
              hitSlop={6}
              style={[styles.actionIcon, isDef && { backgroundColor: colors.accentSoft }]}
              accessibilityLabel={isDef ? "Default class" : "Set as default class"}
            >
              <Feather
                name="star"
                size={14}
                color={isDef ? colors.accent : colors.textSecondary}
              />
            </Pressable>
            <Pressable
              onPress={onStartEdit}
              hitSlop={6}
              style={styles.actionIcon}
              accessibilityLabel="Rename class"
            >
              <Feather name="edit-2" size={13} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onConfirmDelete}
              hitSlop={6}
              style={styles.actionIcon}
              accessibilityLabel="Delete class"
            >
              <Feather name="trash-2" size={13} color={colors.danger} />
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
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
    lineHeight: 15,
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
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  dragHandle: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
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
    padding: 6,
    borderRadius: 6,
  },
  defaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
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
