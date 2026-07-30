import { useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  createNotebook,
  createQuickNote,
  createTask,
  fetchRecentPages,
  fetchTasks,
  openDailyNote,
  updateTask,
} from "../lib/api";
import type { RecentPage, Task } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { useAuth } from "../contexts/auth";
import { useUnlock } from "../contexts/unlock";
import { Fab } from "../components/Fab";
import { PromptModal } from "../components/PromptModal";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const unlock = useUnlock();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  const [captured, setCaptured] = useState(false);
  const [prompt, setPrompt] = useState<"notebook" | "task" | null>(null);
  const captureRef = useRef<TextInput>(null);

  const {
    data: recent,
    isLoading,
    refetch,
  } = useQuery({ queryKey: ["recent-pages"], queryFn: () => fetchRecentPages(8) });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });

  const daily = useMutation({
    mutationFn: openDailyNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      navigation.navigate("Page", {
        pageId: note.id,
        sectionId: note.sectionId,
        notebookId: note.notebookId,
        title: note.title,
      });
    },
  });

  const capture = useMutation({
    mutationFn: () => createQuickNote(draft.trim()),
    onSuccess: () => {
      setDraft("");
      setCaptured(true);
      setTimeout(() => setCaptured(false), 1800);
      queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
    },
  });

  const toggleTask = useMutation({
    mutationFn: (id: string) => updateTask(id, { done: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function openRecent(p: RecentPage) {
    navigation.navigate("Page", {
      pageId: p.id,
      sectionId: p.section.id,
      notebookId: p.section.notebookId,
      title: p.title,
    });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const open = (tasks ?? []).filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < startOfToday);
  const dueToday = open.filter(
    (t) => t.dueAt && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) < endOfToday
  );
  const scheduled: { task: Task; overdue: boolean }[] = [
    ...overdue.map((t) => ({ task: t, overdue: true })),
    ...dueToday.map((t) => ({ task: t, overdue: false })),
  ];
  const list = (scheduled.length > 0 ? scheduled : open.slice(0, 5).map((t) => ({ task: t, overdue: false }))).slice(0, 7);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 170 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
    >
      {/* greeting + daily note */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.textPrimary }]}>
            {greeting()}
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </Text>
        </View>
        <Pressable
          style={[styles.dailyBtn, { backgroundColor: colors.accentSoft }]}
          onPress={() => daily.mutate()}
          disabled={daily.isPending}
        >
          <Feather name="calendar" size={14} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "500" }}>Today's note</Text>
        </Pressable>
      </View>
      {daily.isError && (
        <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>
          {(daily.error as any)?.response?.data?.error ?? "Couldn't open today's note."}
        </Text>
      )}

      {/* quick capture */}
      <View style={[styles.capture, { borderColor: colors.border, backgroundColor: colors.surface1 }]}>
        <TextInput
          ref={captureRef}
          style={[styles.captureInput, { color: colors.textPrimary }]}
          placeholder="Capture a thought…"
          placeholderTextColor={colors.textSecondary}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable
          style={{ padding: 6 }}
          disabled={!draft.trim() || capture.isPending}
          onPress={() => capture.mutate()}
        >
          <Feather name="send" size={16} color={draft.trim() ? colors.accent : colors.textSecondary} />
        </Pressable>
      </View>
      {captured && (
        <Text style={{ color: colors.accent, fontSize: 12, marginTop: 6 }}>Captured to quick notes.</Text>
      )}

      {/* recent pages */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CONTINUE WRITING</Text>
      {(recent ?? []).length === 0 && (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Pages you edit will show up here.</Text>
      )}
      {(recent ?? []).map((p, i) => {
        const sealed = p.section.isLocked && !unlock.sectionPasswords[p.section.id];
        return (
          <Pressable
            key={p.id}
            style={[
              styles.recentRow,
              i === 0 && [styles.recentFeatured, { borderColor: colors.border, backgroundColor: colors.surface1 }],
            ]}
            onPress={() => openRecent(p)}
          >
            <Feather name={sealed ? "lock" : "file-text"} size={14} color={colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ color: colors.textPrimary, fontSize: 14, fontWeight: i === 0 ? "500" : "400" }}
                numberOfLines={1}
              >
                {p.title}
              </Text>
              {i === 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {p.section.notebook.title} / {p.section.title}
                </Text>
              )}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{relativeTime(p.updatedAt)}</Text>
          </Pressable>
        );
      })}

      {/* today's tasks */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        {scheduled.length > 0 ? "TODAY" : "OPEN TASKS"}
      </Text>
      {list.length === 0 && (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Nothing on your plate.</Text>
      )}
      {list.map(({ task, overdue: isOverdue }) => (
        <View key={task.id} style={styles.taskRow}>
          <Pressable onPress={() => toggleTask.mutate(task.id)} hitSlop={8}>
            <Feather name="square" size={16} color={colors.textSecondary} />
          </Pressable>
          <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }} numberOfLines={1}>
            {task.title}
          </Text>
          {isOverdue && <Text style={{ color: colors.danger, fontSize: 12 }}>overdue</Text>}
        </View>
      ))}
    </ScrollView>

    <Fab
      actions={[
        { key: "note", label: "Quick note", icon: "file-text", onPress: () => captureRef.current?.focus() },
        { key: "task", label: "New task", icon: "check-square", onPress: () => setPrompt("task") },
        { key: "notebook", label: "New notebook", icon: "book", onPress: () => setPrompt("notebook") },
      ]}
    />

    <PromptModal
      visible={prompt !== null}
      title={prompt === "task" ? "New task" : "New notebook"}
      placeholder="Title"
      submitLabel="Create"
      onClose={() => setPrompt(null)}
      onSubmit={async (value) => {
        try {
          if (prompt === "task") {
            await createTask({ title: value });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          } else {
            const nb = await createNotebook(value);
            queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            navigation.navigate("Notebook", { notebookId: nb.id, title: nb.title });
          }
          return null;
        } catch (err: any) {
          return err.response?.data?.error ?? "Something went wrong";
        }
      }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  greeting: { fontSize: 20, fontWeight: "500" },
  dailyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  capture: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 16,
  },
  captureInput: { flex: 1, fontSize: 14, maxHeight: 90, paddingVertical: 4 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, marginTop: 24, marginBottom: 8 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  recentFeatured: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 4,
  },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
});
