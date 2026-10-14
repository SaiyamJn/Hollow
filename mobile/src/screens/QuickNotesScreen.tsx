import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { createQuickNote, deleteQuickNote, fetchQuickNotes, reorderQuickNotes, updateQuickNote } from "../lib/api";
import type { QuickNote } from "../lib/types";
import { resolveNoteFields } from "../lib/noteFields";
import { useTheme } from "../contexts/theme";
import { NOTE_COLOR_KEYS, noteTint } from "../theme";
import { ConfirmModal } from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import { Fab } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { ReorderableNoteList } from "../components/ReorderableNoteList";
import { useKeyboardBottomInset } from "../hooks/useKeyboardBottomInset";
import { useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

const ACCENT_BAR: Record<string, string> = {
  gray: "transparent",
  yellow: "rgba(234, 179, 8, 0.65)",
  green: "rgba(34, 197, 94, 0.65)",
  blue: "rgba(56, 189, 248, 0.65)",
  red: "rgba(244, 63, 94, 0.65)",
  purple: "rgba(168, 85, 247, 0.65)",
};

const DOT_COLORS: Record<string, string> = {
  gray: "#8a8d93",
  yellow: "rgba(234, 179, 8, 0.85)",
  green: "rgba(34, 197, 94, 0.85)",
  blue: "rgba(56, 189, 248, 0.85)",
  red: "rgba(244, 63, 94, 0.85)",
  purple: "rgba(168, 85, 247, 0.85)",
};

const GRID_GAP = 10;
const NUM_COLUMNS = 2;

function newItemId() {
  return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function QuickNotesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("yellow");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; label: string } | null>(null);
  const listRef = useRef<FlatList>(null);
  const composerRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardBottomInset();
  const { isNarrow, screenPad, listBottomClearance, fabBottom } = useLayout();
  const { width } = useWindowDimensions();
  const cardWidth = (width - screenPad * 2 - GRID_GAP) / NUM_COLUMNS;
  const selecting = selectMode || selected.size > 0;
  const selectAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(selectAnim, {
      toValue: selecting ? 1 : 0,
      useNativeDriver: true,
      friction: 10,
      tension: 70,
    }).start();
  }, [selecting, selectAnim]);

  // Fetch active + archived together so the Archive chip can switch views cleanly.
  const { data: library } = useQuery({
    queryKey: ["quicknotes", "library"],
    queryFn: () => fetchQuickNotes(true),
  });

  const list = useMemo(() => {
    const all = library ?? [];
    return all.filter((n) => (showArchived ? n.archived : !n.archived));
  }, [library, showArchived]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quicknotes"] });

  useEffect(() => {
    if (!showArchived) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setShowArchived(false);
      return true;
    });
    return () => sub.remove();
  }, [showArchived]);

  useEffect(() => {
    const unsub = navigation?.addListener?.("blur", () => {
      setShowArchived(false);
      clearSelection();
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (!showArchived || Platform.OS !== "web") return;
    const handleKey = (e: any) => {
      if (e.key === "Escape") {
        setShowArchived(false);
      }
    };
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener?.("keydown", handleKey);
    }
  }, [showArchived]);

  const create = useMutation({
    mutationFn: () =>
      createQuickNote({
        content: draft.trim(),
        color: draftColor,
        kind: "note",
        archived: showArchived,
      }),
    onSuccess: () => {
      animateListChange();
      setDraft("");
      setDraftColor("yellow");
      setComposerOpen(false);
      invalidate();
    },
    onError: (err: any) => {
      Alert.alert("Couldn't add note", err?.response?.data?.error ?? "Try again.");
    },
  });
  const createBlankNote = useMutation({
    mutationFn: () =>
      createQuickNote({
        title: "",
        content: " ",
        color: "yellow",
        kind: "note",
        archived: showArchived,
      }),
    onSuccess: (note) => {
      animateListChange();
      invalidate();
      navigation.navigate("QuickNote", {
        noteId: note.id,
        title: note.title ?? "",
        content: (note.content ?? "").trim(),
        color: note.color,
        kind: "note",
        autoFocus: true,
      });
    },
    onError: (err: any) => {
      Alert.alert("Couldn't create note", err?.response?.data?.error ?? "Try again.");
    },
  });
  const createList = useMutation({
    mutationFn: () =>
      createQuickNote({
        title: "",
        content: " ",
        color: "green",
        kind: "list",
        items: [{ id: newItemId(), text: "", done: false }],
        archived: showArchived,
      }),
    onSuccess: (note) => {
      animateListChange();
      invalidate();
      navigation.navigate("QuickNote", {
        noteId: note.id,
        title: note.title ?? "",
        content: "",
        color: note.color,
        kind: "list",
        autoFocus: true,
      });
    },
    onError: (err: any) => {
      Alert.alert(
        "Couldn't create list",
        err?.response?.data?.error ??
          "The server may need updating. Deploy the latest API and run migrations, then try again."
      );
    },
  });

  function openNote(note: QuickNote) {
    const fields = resolveNoteFields(note);
    navigation.navigate("QuickNote", {
      noteId: note.id,
      title: fields.title,
      content: fields.content,
      color: note.color,
      kind: note.kind ?? "note",
    });
  }

  function openComposer() {
    setComposerOpen(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setTimeout(() => composerRef.current?.focus(), 100);
  }

  function openFullNote() {
    if (!createBlankNote.isPending) createBlankNote.mutate();
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectMode(false);
    setColorPickerOpen(false);
  }

  function enterSelection(id: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelected(new Set([id]));
  }

  function addToSelection(id: string) {
    setSelectMode(true);
    setSelected((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  async function persistOrder(group: QuickNote[], orderedIds: string[]) {
    const pinnedIds = list.filter((n) => n.pinned).map((n) => n.id);
    const restIds = list.filter((n) => !n.pinned).map((n) => n.id);
    const isPinnedGroup = group.length > 0 && group.every((n) => n.pinned);
    const merged = isPinnedGroup
      ? [...orderedIds, ...restIds]
      : [...pinnedIds, ...orderedIds];

    queryClient.setQueryData<QuickNote[]>(["quicknotes", "library"], (prev) => {
      if (!prev) return prev;
      const base = Math.floor(Date.now() / 1000);
      const rank = new Map(merged.map((id, i) => [id, base - i]));
      return [...prev]
        .map((n) => (rank.has(n.id) ? { ...n, sortOrder: rank.get(n.id)! } : n))
        .sort((a, b) => {
          if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
        });
    });
    try {
      await reorderQuickNotes(merged);
    } catch {
      invalidate();
    }
  }

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        void Haptics.selectionAsync();
        next.add(id);
      }
      return next;
    });
  }

  async function bulkUpdate(patch: Parameters<typeof updateQuickNote>[1]) {
    const ids = [...selected];
    if (!ids.length) return;
    animateListChange();
    try {
      await Promise.all(ids.map((id) => updateQuickNote(id, patch)));
      clearSelection();
      invalidate();
    } catch (err: any) {
      Alert.alert("Couldn't update", err?.response?.data?.error ?? "Try again.");
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    setPendingDelete({
      ids,
      label:
        ids.length === 1 ? "Move to recycle bin?" : `Move ${ids.length} notes to recycle bin?`,
    });
  }

  async function confirmPendingDelete() {
    const ids = pendingDelete?.ids ?? [];
    if (!ids.length) return;
    animateListChange();
    try {
      await Promise.all(ids.map((id) => deleteQuickNote(id)));
      clearSelection();
      invalidate();
    } catch (err: any) {
      Alert.alert("Couldn't delete", err?.response?.data?.error ?? "Try again.");
    }
  }

  function setArchiveView(next: boolean) {
    clearSelection();
    setShowArchived(next);
  }

  const pinned = list.filter((n) => n.pinned);
  const rest = list.filter((n) => !n.pinned);
  const archivedCount = (library ?? []).filter((n) => n.archived).length;

  type Row =
    | { type: "header"; id: string; label: string }
    | { type: "masonry"; id: string; notes: QuickNote[] };

  const rows: Row[] = [];
  function pushMasonry(items: QuickNote[], label?: string) {
    if (!items.length) return;
    if (label) rows.push({ type: "header", id: `h-${label}`, label });
    rows.push({ type: "masonry", id: `m-${label ?? "all"}`, notes: items });
  }
  pushMasonry(pinned, pinned.length ? "PINNED" : undefined);
  pushMasonry(rest, pinned.length && rest.length ? "OTHERS" : undefined);

  const anySelectedPinned = [...selected].some((id) => list.find((n) => n.id === id)?.pinned);

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingTop: screenPad,
          paddingBottom: listBottomClearance(true) + keyboardInset + (selecting ? 64 : 0),
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        decelerationRate={0.96}
        removeClippedSubviews
        bounces={false}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View
            style={{
              paddingHorizontal: screenPad,
              marginBottom: 14,
              opacity: selecting ? 0.55 : 1,
            }}
            pointerEvents={selecting ? "none" : "auto"}
          >
            {showArchived ? (
              <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Pressable
                  onPress={() => setArchiveView(false)}
                  style={[
                    styles.libraryChip,
                    {
                      alignSelf: "flex-start",
                      borderColor: colors.border,
                      backgroundColor: colors.surface1,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                    },
                  ]}
                  hitSlop={8}
                >
                  <Feather name="arrow-left" size={15} color={colors.textPrimary} />
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
                    Archive
                  </Text>
                  {archivedCount > 0 && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>({archivedCount})</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "600", letterSpacing: -0.3 }}>
                  Notes
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 3, marginBottom: 14 }}>
                  Thoughts & checklists — pin what matters.
                </Text>

                {/* Google Keep minimal 'Take a note...' bar */}
                <Pressable
                  onPress={openComposer}
                  style={[
                    styles.keepBar,
                    {
                      backgroundColor: colors.surface1,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1 }}>
                    Take a note…
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <Pressable
                      onPress={() => {
                        if (!createList.isPending) createList.mutate();
                      }}
                      hitSlop={8}
                      accessibilityLabel="New list"
                    >
                      <Feather name="check-square" size={17} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={openFullNote} hitSlop={8} accessibilityLabel="New note">
                      <Feather name="edit-3" size={17} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </Pressable>

                {composerOpen && (
                  <View
                    style={[
                      styles.composer,
                      {
                        backgroundColor:
                          draftColor !== "gray" ? noteTint(colors, draftColor) : colors.surface1,
                        borderColor: colors.border,
                        borderLeftColor: ACCENT_BAR[draftColor] || colors.accent,
                        marginTop: 10,
                      },
                    ]}
                  >
                    <TextInput
                      ref={composerRef}
                      style={{
                        color: colors.textPrimary,
                        fontSize: 16,
                        minHeight: 88,
                        maxHeight: 240,
                        textAlign: "left",
                        lineHeight: 24,
                      }}
                      placeholder="What's on your mind?"
                      placeholderTextColor={colors.textSecondary}
                      multiline
                      scrollEnabled
                      textAlignVertical="top"
                      value={draft}
                      onChangeText={setDraft}
                    />
                    <View style={styles.composerRow}>
                      <View style={[styles.dots, isNarrow && { gap: 8 }]}>
                        {NOTE_COLOR_KEYS.map((color) => {
                          const isSelected = draftColor === color;
                          const size = isNarrow ? 18 : 22;
                          return (
                            <TouchableOpacity
                              key={color}
                              onPress={() => setDraftColor(color)}
                              activeOpacity={0.7}
                              hitSlop={6}
                              style={{
                                height: size,
                                width: size,
                                borderRadius: size / 2,
                                backgroundColor: DOT_COLORS[color],
                                opacity: isSelected ? 1 : 0.35,
                                transform: [{ scale: isSelected ? 1.15 : 1 }],
                                borderWidth: isSelected ? 2 : 0,
                                borderColor: colors.textPrimary,
                              }}
                            />
                          );
                        })}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setComposerOpen(false);
                            setDraft("");
                          }}
                          hitSlop={8}
                        >
                          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          disabled={!draft.trim() || create.isPending}
                          onPress={() => create.mutate()}
                          activeOpacity={0.75}
                          style={[
                            styles.addButton,
                            { backgroundColor: colors.accent, opacity: draft.trim() ? 1 : 0.45 },
                          ]}
                        >
                          <Text style={{ color: colors.surface0, fontWeight: "600", fontSize: 13 }}>
                            Save
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}

                <View style={styles.libraryRow}>
                  <Pressable
                    onPress={() => setArchiveView(true)}
                    style={[
                      styles.libraryChip,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surface1,
                      },
                    ]}
                  >
                    <Feather
                      name="archive"
                      size={13}
                      color={colors.textSecondary}
                    />
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        fontWeight: "500",
                      }}
                    >
                      Archive{archivedCount > 0 ? ` (${archivedCount})` : ""}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => navigation.navigate("RecycleBin")}
                    style={[
                      styles.libraryChip,
                      { borderColor: colors.border, backgroundColor: colors.surface1 },
                    ]}
                  >
                    <Feather name="trash-2" size={13} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500" }}>
                      Recycle bin
                    </Text>
                  </Pressable>
                </View>
                {!selectMode && (
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 10 }}>
                    Long-press a note to select and rearrange
                  </Text>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  fontWeight: "600",
                  letterSpacing: 0.8,
                  paddingHorizontal: screenPad,
                  marginTop: 8,
                  marginBottom: 8,
                }}
              >
                {item.label}
              </Text>
            );
          }
          return (
            <View style={{ paddingHorizontal: screenPad, marginBottom: GRID_GAP }}>
              <ReorderableNoteList
                notes={item.notes}
                enabled={!showArchived}
                columns={NUM_COLUMNS}
                columnWidth={cardWidth}
                gap={GRID_GAP}
                onReorder={(ids) => void persistOrder(item.notes, ids)}
                renderCard={(note, { dragging, startDrag }) => (
                  <NoteCard
                    note={note}
                    width={cardWidth}
                    selected={selected.has(note.id)}
                    selecting={selecting}
                    dragging={dragging}
                    onOpen={() => openNote(note)}
                    onLongPress={(pageX, pageY) => {
                      if (showArchived) {
                        if (selecting) toggleSelection(note.id);
                        else enterSelection(note.id);
                        return;
                      }
                      if (selecting) addToSelection(note.id);
                      else enterSelection(note.id);
                      startDrag?.(pageX, pageY);
                    }}
                    onToggleSelect={() => toggleSelection(note.id)}
                  />
                )}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={showArchived ? "archive" : "feather"}
            title={showArchived ? "Archive is empty" : "No notes yet"}
            subtitle={
              showArchived
                ? "Tap + to add an archived note, or archive notes from capture."
                : "A quick thought, a checklist — whatever's on your mind."
            }
          />
        }
      />

      {!selecting && (
        <Fab
          actions={
            showArchived
              ? [
                  {
                    key: "note",
                    label: "New note",
                    icon: "edit-3",
                    onPress: openFullNote,
                  },
                  {
                    key: "list",
                    label: "New list",
                    icon: "check-square",
                    onPress: () => {
                      if (!createList.isPending) createList.mutate();
                    },
                  },
                ]
              : [
                  {
                    key: "note",
                    label: "New note",
                    icon: "edit-3",
                    onPress: openFullNote,
                  },
                  {
                    key: "list",
                    label: "New list",
                    icon: "check-square",
                    onPress: () => {
                      if (!createList.isPending) createList.mutate();
                    },
                  },
                  { key: "quick", label: "Quick capture", icon: "zap", onPress: openComposer },
                ]
          }
        />
      )}

      <Animated.View
        pointerEvents={selecting ? "auto" : "none"}
        style={[
          styles.selectDock,
          {
            bottom: fabBottom,
            backgroundColor: colors.surface1,
            borderColor: colors.border,
            opacity: selectAnim,
            transform: [
              {
                translateY: selectAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [28, 0],
                }),
              },
              {
                scale: selectAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable onPress={clearSelection} hitSlop={8} style={styles.selectIconBtn}>
          <Feather name="x" size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600", flex: 1 }}>
          {selected.size} selected
        </Text>
        <Pressable
          onPress={() => bulkUpdate({ pinned: !anySelectedPinned })}
          hitSlop={8}
          style={styles.selectIconBtn}
        >
          <Feather
            name="star"
            size={18}
            color={anySelectedPinned ? colors.accent : colors.textSecondary}
          />
        </Pressable>
        <Pressable
          onPress={() => bulkUpdate({ archived: !showArchived })}
          hitSlop={8}
          style={styles.selectIconBtn}
        >
          <Feather
            name={showArchived ? "rotate-ccw" : "archive"}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable
          onPress={() => setColorPickerOpen((v) => !v)}
          hitSlop={8}
          style={styles.selectIconBtn}
          accessibilityLabel="Set color"
        >
          <Feather
            name="droplet"
            size={18}
            color={colorPickerOpen ? colors.accent : colors.textSecondary}
          />
        </Pressable>
        <Pressable onPress={bulkDelete} hitSlop={8} style={styles.selectIconBtn}>
          <Feather name="trash-2" size={18} color={colors.textSecondary} />
        </Pressable>
      </Animated.View>

      {selecting && colorPickerOpen && (
        <View
          style={{
            position: "absolute",
            bottom: fabBottom + 70,
            left: 20,
            right: 20,
            flexDirection: "row",
            justifyContent: "center",
            gap: 12,
            paddingVertical: 10,
            paddingHorizontal: 16,
            backgroundColor: colors.surface1,
            borderRadius: 24,
            borderColor: colors.border,
            borderWidth: 1,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 6,
            zIndex: 99,
          }}
        >
          {Object.keys(DOT_COLORS).map((c) => (
            <Pressable
              key={c}
              hitSlop={8}
              onPress={() => {
                void bulkUpdate({ color: c });
                setColorPickerOpen(false);
              }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: DOT_COLORS[c],
                borderWidth: 2,
                borderColor: colors.surface0,
              }}
            />
          ))}
        </View>
      )}

      <ConfirmModal
        visible={pendingDelete !== null}
        title={pendingDelete?.label ?? "Move to recycle bin?"}
        message="You can restore it within 7 days."
        confirmLabel="Move"
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
      />
    </KeyboardSafe>
  );
}

function NoteCard({
  note,
  width,
  selected,
  selecting,
  dragging,
  onOpen,
  onLongPress,
  onToggleSelect,
}: {
  note: QuickNote;
  width: number;
  selected: boolean;
  selecting: boolean;
  dragging?: boolean;
  onOpen: () => void;
  onLongPress: (pageX: number, pageY: number) => void;
  onToggleSelect: () => void;
}) {
  const { colors } = useTheme();
  const isList = note.kind === "list";
  const fields = resolveNoteFields(note);
  const title = fields.title;
  const body = fields.content;
  // Show open (unchecked) items first, completed items last — mirror the editor.
  const items = (note.items ?? [])
    .filter((i) => i.text.trim() || !i.done)
    .sort((a, b) => Number(a.done) - Number(b.done));
  const previewItems = items.slice(0, 5);
  const bar = ACCENT_BAR[note.color] ?? colors.border;
  const tint = note.color !== "gray" ? noteTint(colors, note.color) : colors.surface1;
  const cardScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(cardScale, {
      toValue: selected || dragging ? 0.98 : 1,
      useNativeDriver: true,
      friction: 11,
      tension: 85,
    }).start();
  }, [selected, dragging, cardScale]);

  return (
    <Animated.View style={{ width, transform: [{ scale: cardScale }] }}>
      <GlassCard
        strong
        style={{
          width: "100%",
          borderColor: selected ? colors.accent : colors.glassBorder,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          opacity: dragging ? 0.95 : 1,
        }}
        contentStyle={[
          styles.card,
          { backgroundColor: tint, borderLeftWidth: 3, borderLeftColor: bar || colors.border },
        ]}
      >
        <Pressable
          onPress={() => (selecting ? onToggleSelect() : onOpen())}
          onLongPress={(e) => onLongPress(e.nativeEvent.pageX, e.nativeEvent.pageY)}
          delayLongPress={280}
          style={{ flex: 1, alignSelf: "stretch" }}
        >
          {isList ? (
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <Feather name="check-square" size={12} color={colors.accent} />
              <Text
                style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 }}
                numberOfLines={1}
              >
                {title || "List"}
              </Text>
            </View>
            {previewItems.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Tap to add items</Text>
            ) : (
              previewItems.map((item) => (
                <View key={item.id} style={styles.listPreviewRow}>
                  <Feather
                    name={item.done ? "check-square" : "square"}
                    size={12}
                    color={item.done ? colors.accent : colors.textSecondary}
                  />
                  <Text
                    style={[
                      {
                        color: item.done ? colors.textSecondary : colors.textPrimary,
                        fontSize: 12,
                        flex: 1,
                      },
                      item.done && styles.strike,
                    ]}
                    numberOfLines={1}
                  >
                    {item.text || "Item"}
                  </Text>
                </View>
              ))
            )}
            {items.length > previewItems.length && (
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                +{items.length - previewItems.length} more
              </Text>
            )}
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            {!!title && (
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }} numberOfLines={2}>
                {title}
              </Text>
            )}
            {!!body.trim() && (
              <Text
                style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 18, textAlign: "left" }}
                numberOfLines={title ? 7 : 9}
              >
                {body}
              </Text>
            )}
            {!title && !body.trim() && (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Empty note</Text>
            )}
          </View>
        )}
        {note.pinned && (
          <View style={styles.pinHint}>
            <Feather name="star" size={11} color={colors.accent} />
          </View>
        )}
        </Pressable>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  keepBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  quickChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  libraryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selectDock: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  selectIconBtn: { padding: 8 },
  composer: {
    alignSelf: "stretch",
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 12,
  },
  dots: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  addButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  card: { padding: 12, minHeight: 72, gap: 8, alignItems: "stretch" },
  listPreviewRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  strike: { textDecorationLine: "line-through" },
  pinHint: { position: "absolute", top: -2, right: 0 },
});
