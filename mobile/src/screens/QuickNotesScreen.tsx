import { useRef, useState } from "react";
import {
  Alert,
  FlatList,
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
import { createQuickNote, deleteQuickNote, fetchQuickNotes, updateQuickNote } from "../lib/api";
import type { QuickNote } from "../lib/types";
import { resolveNoteFields } from "../lib/noteFields";
import { useTheme } from "../contexts/theme";
import EmptyState from "../components/EmptyState";
import { Fab } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useKeyboardBottomInset } from "../hooks/useKeyboardBottomInset";
import { useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

const PALETTE: Record<string, string> = {
  gray: "transparent",
  yellow: "rgba(234, 179, 8, 0.18)",
  green: "rgba(93, 202, 165, 0.18)",
  blue: "rgba(96, 165, 250, 0.18)",
  red: "rgba(248, 113, 113, 0.18)",
  purple: "rgba(192, 132, 252, 0.18)",
};

const ACCENT_BAR: Record<string, string> = {
  gray: "transparent",
  yellow: "rgb(234, 179, 8)",
  green: "rgb(93, 202, 165)",
  blue: "rgb(96, 165, 250)",
  red: "rgb(248, 113, 113)",
  purple: "rgb(192, 132, 252)",
};

const DOT_COLORS: Record<string, string> = {
  gray: "#8a8d93",
  yellow: "rgb(234, 179, 8)",
  green: "rgb(93, 202, 165)",
  blue: "rgb(96, 165, 250)",
  red: "rgb(248, 113, 113)",
  purple: "rgb(192, 132, 252)",
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
  const listRef = useRef<FlatList>(null);
  const composerRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardBottomInset();
  const { isNarrow, screenPad, listBottomClearance } = useLayout();
  const { width } = useWindowDimensions();
  const cardWidth = (width - screenPad * 2 - GRID_GAP) / NUM_COLUMNS;

  const { data: notes } = useQuery({
    queryKey: ["quicknotes", showArchived],
    queryFn: () => fetchQuickNotes(showArchived),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  const create = useMutation({
    mutationFn: () => createQuickNote({ content: draft.trim(), color: draftColor, kind: "note" }),
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
    // Send a single space so older APIs that require content.min(1) still accept the draft.
    mutationFn: () => createQuickNote({ title: "", content: " ", color: "yellow", kind: "note" }),
    onSuccess: (note) => {
      animateListChange();
      invalidate();
      navigation.navigate("QuickNote", {
        noteId: note.id,
        title: note.title ?? "",
        content: (note.content ?? "").trim(),
        color: note.color,
        kind: "note",
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
      });
    },
    onError: (err: any) => {
      Alert.alert(
        "Couldn't create list",
        err?.response?.data?.error ??
          "The server may need updating. Deploy the latest API and run migrations, then try again."
      );
    },
  });  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateQuickNote>[1] }) =>
      updateQuickNote(id, patch),
    onSuccess: () => {
      animateListChange();
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: deleteQuickNote,
    onMutate: () => animateListChange(),
    onSuccess: invalidate,
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

  const list = notes ?? [];
  const pinned = list.filter((n) => n.pinned);
  const rest = list.filter((n) => !n.pinned);

  // Flat list with optional section headers as data rows for a Keep-like grid.
  type Row =
    | { type: "header"; id: string; label: string }
    | { type: "pair"; id: string; left: QuickNote; right?: QuickNote };

  const rows: Row[] = [];
  function pushPairs(items: QuickNote[], label?: string) {
    if (!items.length) return;
    if (label) rows.push({ type: "header", id: `h-${label}`, label });
    for (let i = 0; i < items.length; i += 2) {
      rows.push({
        type: "pair",
        id: `p-${items[i].id}`,
        left: items[i],
        right: items[i + 1],
      });
    }
  }
  pushPairs(pinned, pinned.length ? "PINNED" : undefined);
  pushPairs(rest, pinned.length && rest.length ? "OTHERS" : undefined);

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingTop: screenPad,
          paddingBottom: listBottomClearance(true) + keyboardInset,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: screenPad, marginBottom: 14 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "600", letterSpacing: -0.3 }}>
              Capture
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              Sticky notes & checklists — pin what matters.
            </Text>

            <View style={styles.quickRow}>
              <Pressable
                onPress={openFullNote}
                disabled={createBlankNote.isPending}
                style={[
                  styles.quickChip,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface1,
                    opacity: createBlankNote.isPending ? 0.6 : 1,
                  },
                ]}
              >
                <View style={[styles.quickIcon, { backgroundColor: "rgba(234, 179, 8, 0.2)" }]}>
                  <Feather name="edit-3" size={16} color="rgb(234, 179, 8)" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
                    {createBlankNote.isPending ? "Opening…" : "Note"}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                    Title + body
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!createList.isPending) createList.mutate();
                }}
                disabled={createList.isPending}
                style={[
                  styles.quickChip,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface1,
                    opacity: createList.isPending ? 0.6 : 1,
                  },
                ]}
              >
                <View style={[styles.quickIcon, { backgroundColor: "rgba(93, 202, 165, 0.2)" }]}>
                  <Feather name="check-square" size={16} color="rgb(93, 202, 165)" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
                    {createList.isPending ? "Creating…" : "List"}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                    Shopping, todos…
                  </Text>
                </View>
              </Pressable>
            </View>

            <Pressable onPress={openComposer} style={{ marginBottom: composerOpen ? 10 : 0 }}>
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "500" }}>
                Quick capture…
              </Text>
            </Pressable>

            {composerOpen && (
              <View
                style={[
                  styles.composer,
                  {
                    backgroundColor: colors.surface1,
                    borderColor: colors.border,
                    borderLeftColor: ACCENT_BAR[draftColor] || colors.accent,
                  },
                ]}
              >
                <TextInput
                  ref={composerRef}
                  style={{ color: colors.textPrimary, fontSize: 15, minHeight: 56, textAlign: "left", lineHeight: 22 }}
                  placeholder="What's on your mind?"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  textAlignVertical="top"
                  value={draft}
                  onChangeText={setDraft}
                />
                <View style={styles.composerRow}>
                  <View style={[styles.dots, isNarrow && { gap: 8 }]}>
                    {Object.keys(PALETTE).map((color) => {
                      const selected = draftColor === color;
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
                            opacity: selected ? 1 : 0.35,
                            transform: [{ scale: selected ? 1.15 : 1 }],
                            borderWidth: selected ? 2 : 0,
                            borderColor: colors.textPrimary,
                          }}
                        />
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TouchableOpacity onPress={() => { setComposerOpen(false); setDraft(""); }} hitSlop={8}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={!draft.trim() || create.isPending}
                      onPress={() => create.mutate()}
                      activeOpacity={0.75}
                      style={[styles.addButton, { backgroundColor: colors.accent, opacity: draft.trim() ? 1 : 0.45 }]}
                    >
                      <Text style={{ color: colors.surface0, fontWeight: "600", fontSize: 13 }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.libraryRow}>
              <Pressable
                onPress={() => setShowArchived((v) => !v)}
                style={[
                  styles.libraryChip,
                  {
                    borderColor: showArchived ? colors.accent : colors.border,
                    backgroundColor: showArchived ? colors.accentSoft : colors.surface1,
                  },
                ]}
              >
                <Feather
                  name="archive"
                  size={14}
                  color={showArchived ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={{
                    color: showArchived ? colors.accent : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: "500",
                  }}
                >
                  {showArchived ? "Archived" : "Archive"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("RecycleBin")}
                style={[
                  styles.libraryChip,
                  { borderColor: colors.border, backgroundColor: colors.surface1 },
                ]}
              >
                <Feather name="trash-2" size={14} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500" }}>
                  Recycle bin
                </Text>
                <Feather name="chevron-right" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
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
            <View style={{ flexDirection: "row", gap: GRID_GAP, paddingHorizontal: screenPad, marginBottom: GRID_GAP }}>
              <NoteCard
                note={item.left}
                width={cardWidth}
                onOpen={() => openNote(item.left)}
                onPatch={(patch) => update.mutate({ id: item.left.id, patch })}
                onDelete={() => remove.mutate(item.left.id)}
              />
              {item.right ? (
                <NoteCard
                  note={item.right}
                  width={cardWidth}
                  onOpen={() => openNote(item.right!)}
                  onPatch={(patch) => update.mutate({ id: item.right!.id, patch })}
                  onDelete={() => remove.mutate(item.right!.id)}
                />
              ) : (
                <View style={{ width: cardWidth }} />
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="feather"
            title="Nothing captured yet"
            subtitle="Tap Note for a sticky thought, or List for a checklist that stays together."
          />
        }
      />

      <Fab
        actions={[
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
          {
            key: "quick",
            label: "Quick capture",
            icon: "zap",
            onPress: openComposer,
          },
        ]}
      />
    </KeyboardSafe>
  );
}

function NoteCard({
  note,
  width,
  onOpen,
  onPatch,
  onDelete,
}: {
  note: QuickNote;
  width: number;
  onOpen: () => void;
  onPatch: (patch: Partial<Pick<QuickNote, "title" | "content" | "color" | "pinned" | "archived" | "items">>) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const isList = note.kind === "list";
  const fields = resolveNoteFields(note);
  const title = fields.title;
  const body = fields.content;
  const items = (note.items ?? []).filter((i) => i.text.trim() || !i.done);
  const previewItems = items.slice(0, 5);
  const bar = ACCENT_BAR[note.color] ?? colors.border;
  const tint = note.color !== "gray" ? PALETTE[note.color] : colors.surface1;

  return (
    <GlassCard
      style={{ width }}
      contentStyle={[styles.card, { backgroundColor: tint, borderLeftWidth: 3, borderLeftColor: bar || colors.border }]}
    >
      <Pressable onPress={onOpen} style={{ flex: 1, alignSelf: "stretch" }}>
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
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable onPress={() => onPatch({ pinned: !note.pinned })} hitSlop={6}>
          <Feather name="star" size={14} color={note.pinned ? colors.accent : colors.textSecondary} />
        </Pressable>
        <Pressable onPress={() => onPatch({ archived: !note.archived })} hitSlop={6}>
          <Feather name={note.archived ? "rotate-ccw" : "archive"} size={14} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={6}>
          <Feather name="trash-2" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  quickChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
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
  card: { padding: 12, minHeight: 110, justifyContent: "space-between", gap: 12, alignItems: "stretch" },
  cardActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 14 },
  listPreviewRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  strike: { textDecorationLine: "line-through" },
});
