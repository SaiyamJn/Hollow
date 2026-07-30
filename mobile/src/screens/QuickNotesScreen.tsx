import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { createQuickNote, deleteQuickNote, fetchQuickNotes, updateQuickNote } from "../lib/api";
import type { QuickNote } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { Fab } from "../components/Fab";

const PALETTE: Record<string, string> = {
  gray: "transparent",
  yellow: "rgba(234, 179, 8, 0.14)",
  green: "rgba(93, 202, 165, 0.14)",
  blue: "rgba(96, 165, 250, 0.14)",
  red: "rgba(248, 113, 113, 0.14)",
  purple: "rgba(192, 132, 252, 0.14)",
};

const DOT_COLORS: Record<string, string> = {
  gray: "rgba(128, 128, 128, 0.6)",
  yellow: "rgb(234, 179, 8)",
  green: "rgb(93, 202, 165)",
  blue: "rgb(96, 165, 250)",
  red: "rgb(248, 113, 113)",
  purple: "rgb(192, 132, 252)",
};

export default function QuickNotesScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("gray");
  const listRef = useRef<FlatList>(null);
  const composerRef = useRef<TextInput>(null);

  const { data: notes } = useQuery({
    queryKey: ["quicknotes", showArchived],
    queryFn: () => fetchQuickNotes(showArchived),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  const create = useMutation({
    mutationFn: () => createQuickNote(draft.trim(), draftColor),
    onSuccess: () => {
      setDraft("");
      setDraftColor("gray");
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateQuickNote>[1] }) =>
      updateQuickNote(id, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteQuickNote, onSuccess: invalidate });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <FlatList
        ref={listRef}
        data={notes ?? []}
        keyExtractor={(n) => n.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 170, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <View style={[styles.composer, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
              <TextInput
                ref={composerRef}
                style={{ color: colors.textPrimary, fontSize: 14, minHeight: 40 }}
                placeholder="Take a note…"
                placeholderTextColor={colors.textSecondary}
                multiline
                value={draft}
                onChangeText={setDraft}
              />
              <View style={styles.composerRow}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {Object.keys(PALETTE).map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setDraftColor(color)}
                      style={[
                        styles.dot,
                        { backgroundColor: DOT_COLORS[color], borderColor: draftColor === color ? colors.accent : colors.border },
                      ]}
                    />
                  ))}
                </View>
                <Pressable
                  disabled={!draft.trim() || create.isPending}
                  onPress={() => create.mutate()}
                  style={[styles.addButton, { backgroundColor: colors.accent, opacity: draft.trim() ? 1 : 0.5 }]}
                >
                  <Text style={{ color: colors.surface0, fontWeight: "500", fontSize: 13 }}>Add</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={() => setShowArchived((v) => !v)} style={{ marginTop: 10, alignSelf: "flex-end" }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <NoteCard
            note={item}
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
    </View>
  );
}

function NoteCard({
  note,
  onPatch,
  onDelete,
}: {
  note: QuickNote;
  onPatch: (patch: Partial<Pick<QuickNote, "color" | "pinned" | "archived">>) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: note.color !== "gray" ? PALETTE[note.color] : colors.surface1,
        },
      ]}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>{note.content}</Text>
        <Pressable onPress={() => onPatch({ pinned: !note.pinned })}>
          <Feather name="bookmark" size={14} color={note.pinned ? colors.accent : colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.cardActions}>
        <Pressable onPress={() => onPatch({ archived: !note.archived })}>
          <Feather name={note.archived ? "rotate-ccw" : "archive"} size={14} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onDelete}>
          <Feather name="trash-2" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  composerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
  addButton: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6 },
  card: { flex: 1, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 10 },
});
