import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  deleteQuickNotePermanent,
  fetchQuickNotes,
  restoreQuickNote,
} from "../lib/api";
import type { QuickNote } from "../lib/types";
import { useTheme } from "../contexts/theme";
import EmptyState from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 7;

function daysLeft(deletedAt: string | null | undefined) {
  if (!deletedAt) return KEEP_DAYS;
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, Math.ceil(KEEP_DAYS - elapsed / DAY_MS));
}

function previewLabel(note: QuickNote) {
  const title = (note.title ?? "").trim();
  if (title) return title;
  if (note.kind === "list") {
    const first = (note.items ?? []).find((i) => i.text.trim());
    return first?.text.trim() || "List";
  }
  const body = (note.content ?? "").trim();
  return body ? body.slice(0, 80) : "Note";
}

export default function RecycleBinScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance } = useLayout();

  const { data: trashed } = useQuery({
    queryKey: ["quicknotes", "trash"],
    queryFn: () => fetchQuickNotes(true, true),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  };

  const restore = useMutation({
    mutationFn: restoreQuickNote,
    onMutate: () => animateListChange(),
    onSuccess: invalidate,
    onError: (err: any) => {
      Alert.alert("Couldn't restore", err?.response?.data?.error ?? "Try again.");
    },
  });

  const purgeOne = useMutation({
    mutationFn: deleteQuickNotePermanent,
    onMutate: () => animateListChange(),
    onSuccess: invalidate,
  });

  const emptyAll = useMutation({
    mutationFn: async () => {
      const ids = (trashed ?? []).map((n) => n.id);
      for (const id of ids) await deleteQuickNotePermanent(id);
    },
    onMutate: () => animateListChange(),
    onSuccess: invalidate,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <FlatList
        data={trashed ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{
          padding: screenPad,
          paddingBottom: stackBottomClearance(false),
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={{ marginBottom: 14 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Deleted notes & lists stay here for 7 days, then they're removed for good.
            </Text>
            {(trashed?.length ?? 0) > 0 && (
              <Pressable
                onPress={() =>
                  Alert.alert("Empty recycle bin?", "This permanently deletes everything here.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Empty",
                      style: "destructive",
                      onPress: () => emptyAll.mutate(),
                    },
                  ])
                }
                style={{ alignSelf: "flex-start", marginTop: 10 }}
              >
                <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "500" }}>
                  Empty bin
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const left = daysLeft(item.deletedAt);
          return (
            <GlassCard style={{ marginBottom: 10 }} contentStyle={styles.row}>
              <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
                <Feather
                  name={item.kind === "list" ? "check-square" : "file-text"}
                  size={16}
                  color={colors.accent}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }} numberOfLines={1}>
                  {previewLabel(item)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {left === 0 ? "Deletes today" : `${left} day${left === 1 ? "" : "s"} left`}
                  {item.kind === "list" ? " · List" : " · Note"}
                </Text>
              </View>
              <Pressable
                onPress={() => restore.mutate(item.id)}
                hitSlop={8}
                style={{ padding: 6 }}
                accessibilityLabel="Restore"
              >
                <Feather name="rotate-ccw" size={16} color={colors.accent} />
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert("Delete forever?", "This can't be undone.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => purgeOne.mutate(item.id),
                    },
                  ])
                }
                hitSlop={8}
                style={{ padding: 6 }}
              >
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </GlassCard>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="trash-2"
            title="Recycle bin is empty"
            subtitle="Deleted notes and lists will appear here for 7 days."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
