import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { createQuickNote, deleteQuickNote, fetchQuickNotes, updateQuickNote } from "../lib/api";
import type { QuickNote } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { Fab } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useKeyboardBottomInset } from "../hooks/useKeyboardBottomInset";
import { useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

const PALETTE: Record<string, string> = {
  gray: "transparent",
  yellow: "rgba(234, 179, 8, 0.14)",
  green: "rgba(93, 202, 165, 0.14)",
  blue: "rgba(96, 165, 250, 0.14)",
  red: "rgba(248, 113, 113, 0.14)",
  purple: "rgba(192, 132, 252, 0.14)",
};

const DOT_COLORS: Record<string, string> = {
  gray: "#8a8d93",
  yellow: "rgb(234, 179, 8)",
  green: "rgb(93, 202, 165)",
  blue: "rgb(96, 165, 250)",
  red: "rgb(248, 113, 113)",
  purple: "rgb(192, 132, 252)",
};

export default function QuickNotesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("gray");
  const listRef = useRef<FlatList>(null);
  const composerRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardBottomInset();
  const { isNarrow, screenPad, listBottomClearance } = useLayout();
  const numColumns = isNarrow ? 1 : 2;

  const { data: notes } = useQuery({
    queryKey: ["quicknotes", showArchived],
    queryFn: () => fetchQuickNotes(showArchived),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  const create = useMutation({
    mutationFn: () => createQuickNote(draft.trim(), draftColor),
    onSuccess: () => {
      animateListChange();
      setDraft("");
      setDraftColor("gray");
      invalidate();
    },
  });
  const update = useMutation({
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
    navigation.navigate("QuickNote", {
      noteId: note.id,
      content: note.content,
      color: note.color,
    });
  }

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
      <FlatList
        ref={listRef}
        data={notes ?? []}
        keyExtractor={(n) => n.id}
        key={`cols-${numColumns}`}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: 10, paddingHorizontal: screenPad } : undefined}
        contentContainerStyle={{
          paddingTop: screenPad,
          paddingHorizontal: numColumns === 1 ? screenPad : 0,
          paddingBottom: listBottomClearance(true) + keyboardInset,
          gap: 10,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View
            style={{
              paddingHorizontal: numColumns > 1 ? screenPad : 0,
              marginBottom: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 12 }}>
              Capture thoughts — star the keepers.
            </Text>
            {/* Solid panel (no BlurView) — glass blur was casting a halo around the dots/Add. */}
            <View
              style={[
                styles.composer,
                { backgroundColor: colors.surface1, borderColor: colors.border },
              ]}
            >
              <TextInput
                ref={composerRef}
                style={{ color: colors.textPrimary, fontSize: 14, minHeight: 40, textAlign: "center" }}
                placeholder="Take a note…"
                placeholderTextColor={colors.textSecondary}
                multiline
                value={draft}
                onChangeText={setDraft}
                onFocus={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              />
              <View style={styles.composerRow}>
                <View style={[styles.dots, isNarrow && { gap: 8 }]}>
                  {Object.keys(PALETTE).map((color) => {
                    const selected = draftColor === color;
                    const size = isNarrow ? 20 : 24;
                    return (
                      <TouchableOpacity
                        key={color}
                        onPress={() => setDraftColor(color)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        hitSlop={6}
                        style={{
                          height: size,
                          width: size,
                          borderRadius: size / 2,
                          backgroundColor: DOT_COLORS[color],
                          opacity: selected ? 1 : 0.4,
                          transform: [{ scale: selected ? 1.12 : 1 }],
                        }}
                      />
                    );
                  })}
                </View>
                <TouchableOpacity
                  disabled={!draft.trim() || create.isPending}
                  onPress={() => create.mutate()}
                  activeOpacity={0.75}
                  style={[styles.addButton, { backgroundColor: colors.accent, opacity: draft.trim() ? 1 : 0.5 }]}
                >
                  <Text style={{ color: colors.surface0, fontWeight: "500", fontSize: 13 }}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Pressable onPress={() => setShowArchived((v) => !v)} style={{ marginTop: 10 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "center" }}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <NoteCard
            note={item}
            onOpen={() => openNote(item)}
            onPatch={(patch) => update.mutate({ id: item.id, patch })}
            onDelete={() => remove.mutate(item.id)}
          />
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 24 }}>
            Nothing here yet.
          </Text>
        }
      />

      <Fab
        actions={[
          {
            key: "note",
            label: "New quick note",
            icon: "file-text",
            onPress: () => {
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
              composerRef.current?.focus();
            },
          },
        ]}
      />
    </KeyboardSafe>
  );
}

function NoteCard({
  note,
  onOpen,
  onPatch,
  onDelete,
}: {
  note: QuickNote;
  onOpen: () => void;
  onPatch: (patch: Partial<Pick<QuickNote, "content" | "color" | "pinned" | "archived">>) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  return (
    <GlassCard
      style={{ flex: 1 }}
      contentStyle={[
        styles.card,
        note.color !== "gray" ? { backgroundColor: PALETTE[note.color] } : null,
      ]}
    >
      <Pressable onPress={onOpen} style={{ flex: 1, alignSelf: "stretch" }}>
        <Text style={{ color: colors.textPrimary, fontSize: 13, textAlign: "center" }} numberOfLines={6}>
          {note.content}
        </Text>
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable onPress={() => onPatch({ pinned: !note.pinned })}>
          <Feather name="star" size={14} color={note.pinned ? colors.accent : colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onOpen}>
          <Feather name="edit-2" size={14} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={() => onPatch({ archived: !note.archived })}>
          <Feather name={note.archived ? "rotate-ccw" : "archive"} size={14} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onDelete}>
          <Feather name="trash-2" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  composer: {
    alignSelf: "stretch",
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 16,
  },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 10 },
  addButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    // Kill Android elevation / material halo on the filled button.
    elevation: 0,
    shadowOpacity: 0,
  },
  card: { padding: 12, minHeight: 88, justifyContent: "space-between", gap: 10, alignItems: "center" },
  cardActions: { flexDirection: "row", justifyContent: "center", gap: 14 },
});
