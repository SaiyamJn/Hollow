import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  deletePagePermanent,
  deleteQuickNotePermanent,
  deleteTaskPermanent,
  fetchQuickNotes,
  fetchTrashedPages,
  fetchTrashedTasks,
  restorePage,
  restoreQuickNote,
  restoreTask,
} from "../lib/api";
import type { QuickNote, Task, TrashedPage } from "../lib/types";
import { useTheme } from "../contexts/theme";
import EmptyState from "../components/EmptyState";
import { ConfirmModal } from "../components/ConfirmModal";
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

type Tab = "notes" | "pages" | "tasks";

function noun(tab: Tab, n: number) {
  const one = tab === "notes" ? "note" : tab === "pages" ? "page" : "task";
  return n === 1 ? one : `${one}s`;
}

export default function RecycleBinScreen({
  route,
}: {
  route?: { params?: { tab?: Tab } };
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance } = useLayout();
  const incoming = route?.params?.tab;
  const [tab, setTab] = useState<Tab>(
    incoming === "tasks" || incoming === "pages" ? incoming : "notes"
  );
  const [confirm, setConfirm] = useState<
    | { kind: "empty" }
    | { kind: "purge"; id: string }
    | null
  >(null);

  const { data: trashedNotes } = useQuery({
    queryKey: ["quicknotes", "trash"],
    queryFn: () => fetchQuickNotes(true, true),
  });
  const { data: trashedPages } = useQuery({
    queryKey: ["pages", "trash"],
    queryFn: fetchTrashedPages,
  });
  const { data: trashedTasks } = useQuery({
    queryKey: ["tasks", "trash"],
    queryFn: fetchTrashedTasks,
  });

  const invalidateNotes = () => {
    void queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  };
  const invalidatePages = () => {
    void queryClient.invalidateQueries({ queryKey: ["pages"] });
    void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
  };
  const invalidateTasks = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const restoreNote = useMutation({
    mutationFn: restoreQuickNote,
    onMutate: () => animateListChange(),
    onSuccess: invalidateNotes,
    onError: (err: any) => {
      Alert.alert("Couldn't restore", err?.response?.data?.error ?? "Try again.");
    },
  });
  const purgeNote = useMutation({
    mutationFn: deleteQuickNotePermanent,
    onMutate: () => animateListChange(),
    onSuccess: invalidateNotes,
  });
  const emptyNotes = useMutation({
    mutationFn: async () => {
      for (const id of (trashedNotes ?? []).map((n) => n.id)) await deleteQuickNotePermanent(id);
    },
    onMutate: () => animateListChange(),
    onSuccess: invalidateNotes,
  });

  const restorePageMut = useMutation({
    mutationFn: restorePage,
    onMutate: () => animateListChange(),
    onSuccess: invalidatePages,
    onError: (err: any) => {
      Alert.alert("Couldn't restore", err?.response?.data?.error ?? "Try again.");
    },
  });
  const purgePage = useMutation({
    mutationFn: deletePagePermanent,
    onMutate: () => animateListChange(),
    onSuccess: invalidatePages,
  });
  const emptyPages = useMutation({
    mutationFn: async () => {
      for (const id of (trashedPages ?? []).map((p) => p.id)) await deletePagePermanent(id);
    },
    onMutate: () => animateListChange(),
    onSuccess: invalidatePages,
  });

  const restoreTaskMut = useMutation({
    mutationFn: restoreTask,
    onMutate: () => animateListChange(),
    onSuccess: invalidateTasks,
    onError: (err: any) => {
      Alert.alert("Couldn't restore", err?.response?.data?.error ?? "Try again.");
    },
  });
  const purgeTask = useMutation({
    mutationFn: deleteTaskPermanent,
    onMutate: () => animateListChange(),
    onSuccess: invalidateTasks,
  });
  const emptyTasks = useMutation({
    mutationFn: async () => {
      for (const id of (trashedTasks ?? []).map((t) => t.id)) await deleteTaskPermanent(id);
    },
    onMutate: () => animateListChange(),
    onSuccess: invalidateTasks,
  });

  const notes = trashedNotes ?? [];
  const pages = trashedPages ?? [];
  const tasks = trashedTasks ?? [];
  const data = tab === "notes" ? notes : tab === "pages" ? pages : tasks;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <FlatList
        data={data as Array<QuickNote | Task | TrashedPage>}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: screenPad,
          paddingBottom: stackBottomClearance(false),
          flexGrow: 1,
        }}
        decelerationRate="normal"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ marginBottom: 12, gap: 10 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>
              Notes, pages, and tasks stay here for 7 days.
            </Text>
            <View style={styles.tabs}>
              {(["notes", "pages", "tasks"] as const).map((id) => {
                const active = tab === id;
                const count = id === "notes" ? notes.length : id === "pages" ? pages.length : tasks.length;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setTab(id)}
                    style={[
                      styles.tab,
                      {
                        borderColor: active ? colors.accent : colors.glassBorder,
                        backgroundColor: active ? colors.accentSoft : colors.glass,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? colors.accent : colors.textSecondary, fontSize: 13, fontWeight: "700" }}>
                      {id === "notes" ? "Notes" : id === "pages" ? "Pages" : "Tasks"}
                      {count > 0 ? ` (${count})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {data.length > 0 && (
              <Pressable
                onPress={() => setConfirm({ kind: "empty" })}
                style={{ alignSelf: "center", paddingVertical: 6, paddingHorizontal: 10 }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Empty {tab}</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (tab === "notes") {
            const note = item as QuickNote;
            const left = daysLeft(note.deletedAt);
            return (
              <GlassCard style={{ marginBottom: 8 }} contentStyle={styles.row}>
                <Feather name="file-text" size={15} color={colors.textSecondary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                    {previewLabel(note)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{left}d left</Text>
                </View>
                <Pressable onPress={() => restoreNote.mutate(note.id)} hitSlop={8}>
                  <Feather name="rotate-ccw" size={16} color={colors.accent} />
                </Pressable>
                <Pressable onPress={() => setConfirm({ kind: "purge", id: note.id })} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={colors.textSecondary} />
                </Pressable>
              </GlassCard>
            );
          }
          if (tab === "pages") {
            const page = item as TrashedPage;
            const left = daysLeft(page.deletedAt);
            return (
              <GlassCard style={{ marginBottom: 8 }} contentStyle={styles.row}>
                <Feather name="book-open" size={15} color={colors.textSecondary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                    {page.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {page.notebookTitle} · {page.sectionTitle} · {left}d left
                  </Text>
                </View>
                <Pressable onPress={() => restorePageMut.mutate(page.id)} hitSlop={8}>
                  <Feather name="rotate-ccw" size={16} color={colors.accent} />
                </Pressable>
                <Pressable onPress={() => setConfirm({ kind: "purge", id: page.id })} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={colors.textSecondary} />
                </Pressable>
              </GlassCard>
            );
          }
          const task = item as Task;
          const left = daysLeft(task.deletedAt);
          const subCount = task.subtasks?.length ?? 0;
          return (
            <GlassCard style={{ marginBottom: 8 }} contentStyle={styles.row}>
              <Feather name="check-square" size={15} color={colors.textSecondary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                  {task.title}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {subCount > 0 ? `${subCount} sub · ` : ""}
                  {left}d left
                </Text>
              </View>
              <Pressable onPress={() => restoreTaskMut.mutate(task.id)} hitSlop={8}>
                <Feather name="rotate-ccw" size={16} color={colors.accent} />
              </Pressable>
              <Pressable onPress={() => setConfirm({ kind: "purge", id: task.id })} hitSlop={8}>
                <Feather name="trash-2" size={16} color={colors.textSecondary} />
              </Pressable>
            </GlassCard>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="trash-2"
            title={`No ${noun(tab, 2)} in the bin`}
            subtitle="Deleted items appear here for 7 days."
          />
        }
      />
      <ConfirmModal
        visible={confirm !== null}
        title={confirm?.kind === "empty" ? `Empty ${tab}?` : "Delete forever?"}
        message={
          confirm?.kind === "empty"
            ? `Permanently delete ${data.length} ${noun(tab, data.length)}? This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel={confirm?.kind === "empty" ? "Empty" : "Delete"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm?.kind === "empty") {
            if (tab === "notes") await emptyNotes.mutateAsync();
            else if (tab === "pages") await emptyPages.mutateAsync();
            else await emptyTasks.mutateAsync();
          } else if (confirm?.kind === "purge") {
            if (tab === "notes") await purgeNote.mutateAsync(confirm.id);
            else if (tab === "pages") await purgePage.mutateAsync(confirm.id);
            else await purgeTask.mutateAsync(confirm.id);
          }
          setConfirm(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  tab: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
