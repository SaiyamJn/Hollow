import { useEffect, useRef, useState } from "react";
import {
  Animated,
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
import { TaskFormModal, repeatPayload, type TaskDraft } from "../components/TaskFormModal";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { animateTaskComplete } from "../lib/motion";
import { useKeyboardBottomInset } from "../hooks/useKeyboardBottomInset";
import { useLayout } from "../lib/layout";
import { pickGreeting } from "../lib/greetings";

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
  const [prompt, setPrompt] = useState<"notebook" | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [hello, setHello] = useState(() => pickGreeting());
  const captureRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardBottomInset();
  const { isNarrow, screenPad, listBottomClearance } = useLayout();

  useEffect(() => {
    const tick = () => setHello(pickGreeting());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

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
    mutationFn: () => createQuickNote({ content: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      setCaptured(true);
      setTimeout(() => setCaptured(false), 1800);
      queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
    },
  });

  const toggleTask = useMutation({
    mutationFn: (id: string) => updateTask(id, { done: true }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const prev = queryClient.getQueryData<Task[]>(["tasks"]);
      // Optimistic: mark done so the row can animate out without a flicker/reappear.
      queryClient.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, done: true } : t))
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["tasks"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const [completing, setCompleting] = useState<Record<string, boolean>>({});

  function completeHomeTask(id: string) {
    if (completing[id]) return;
    setCompleting((m) => ({ ...m, [id]: true }));
  }

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

  const open = (tasks ?? []).filter((t) => {
    // Keep the row mounted briefly while the check-off animation plays.
    if (completing[t.id]) return true;
    if (t.done) return false;
    // Future repeating occurrences wait for their day (calendar still shows them).
    if (t.repeatRule && t.dueAt && new Date(t.dueAt) >= endOfToday) return false;
    return true;
  });
  const overdue = open.filter((t) => !completing[t.id] && t.dueAt && new Date(t.dueAt) < startOfToday);
  const dueToday = open.filter(
    (t) =>
      !completing[t.id] &&
      t.dueAt &&
      new Date(t.dueAt) >= startOfToday &&
      new Date(t.dueAt) < endOfToday
  );
  const completingRows = open.filter((t) => completing[t.id]);
  const liveOpen = open.filter((t) => !completing[t.id]);
  const scheduled: { task: Task; overdue: boolean }[] = [
    ...overdue.map((t) => ({ task: t, overdue: true })),
    ...dueToday.map((t) => ({ task: t, overdue: false })),
  ];
  const list = (
    scheduled.length > 0
      ? [...scheduled, ...completingRows.map((t) => ({ task: t, overdue: false as boolean }))]
      : [
          ...liveOpen.slice(0, 5).map((t) => ({ task: t, overdue: false as boolean })),
          ...completingRows.map((t) => ({ task: t, overdue: false as boolean })),
        ]
  ).slice(0, 8);

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: screenPad, paddingBottom: listBottomClearance(true) + keyboardInset }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
      showsVerticalScrollIndicator={false}
      decelerationRate="normal"
      scrollEventThrottle={16}
    >
      {/* greeting + daily note */}
      <View style={[styles.headerRow, isNarrow && styles.headerStacked]}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: isNarrow ? 0 : 12 }}>
          <Text style={[styles.greeting, { color: colors.textPrimary, fontSize: isNarrow ? 18 : 20 }]}>
            {hello}
          </Text>
          {!!user?.name && (
            <Text
              style={[styles.greetingName, { color: colors.textPrimary, fontSize: isNarrow ? 18 : 20 }]}
              numberOfLines={2}
            >
              {user.name.split(" ")[0]}
            </Text>
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }} numberOfLines={1}>
            {new Date().toLocaleDateString(undefined, {
              weekday: isNarrow ? "short" : "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>
        <Pressable
          style={[styles.dailyBtn, { backgroundColor: colors.accentSoft }, isNarrow && { alignSelf: "flex-start" }]}
          onPress={() => daily.mutate()}
          disabled={daily.isPending}
        >
          <Feather name="calendar" size={14} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "500" }}>
            {isNarrow ? "Today" : "Today's note"}
          </Text>
        </Pressable>
      </View>
      {daily.isError && (
        <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>
          {(daily.error as any)?.response?.data?.error ?? "Couldn't open today's note."}
        </Text>
      )}

      {/* quick capture */}
      <GlassCard style={{ marginTop: 16 }} contentStyle={styles.capture}>
        <TextInput
          ref={captureRef}
          style={[styles.captureInput, { color: colors.textPrimary }]}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.textSecondary}
          value={draft}
          onChangeText={setDraft}
          multiline
          scrollEnabled
        />
        <Pressable
          style={{ padding: 6 }}
          disabled={!draft.trim() || capture.isPending}
          onPress={() => capture.mutate()}
        >
          <Feather name="send" size={16} color={draft.trim() ? colors.accent : colors.textSecondary} />
        </Pressable>
      </GlassCard>
      {captured && (
        <Text style={{ color: colors.accent, fontSize: 12, marginTop: 6 }}>Captured to quick notes.</Text>
      )}

      {/* section shortcuts — one bar, not four matching cards */}
      <GlassCard style={{ marginTop: 12 }} contentStyle={styles.shortcuts}>
        {(
          [
            { label: "Notebooks", icon: "book" as const, tab: "Notebooks" },
            { label: "Notes", icon: "file-text" as const, tab: "Quick notes" },
            { label: "Tasks", icon: "check-square" as const, tab: "Tasks" },
            { label: "Links", icon: "share-2" as const, tab: "Links" },
          ] as const
        ).map((item, i) => (
          <Pressable
            key={item.tab}
            style={[styles.shortcut, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
            onPress={() => navigation.navigate(item.tab)}
          >
            <View
              style={{
                height: 28,
                width: 28,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.accentSoft,
                marginBottom: 4,
              }}
            >
              <Feather name={item.icon} size={14} color={colors.accent} />
            </View>
            <Text
              style={{ color: colors.textPrimary, fontSize: isNarrow ? 11 : 12, fontWeight: "600", textAlign: "center" }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </GlassCard>

      {/* recent pages */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CONTINUE WRITING</Text>
      {(recent ?? []).length === 0 && (
        <View style={styles.quietEmpty}>
          <Feather name="edit-3" size={13} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
            Pages you edit will show up here
          </Text>
        </View>
      )}
      {(recent ?? []).map((p, i) => {
        const sealed = p.section.isLocked && !unlock.sectionPasswords[p.section.id];
        if (i === 0) {
          return (
            <Pressable key={p.id} onPress={() => openRecent(p)} style={{ marginBottom: 4 }}>
              <GlassCard contentStyle={styles.recentFeatured}>
                <View style={styles.recentRow}>
                  <Feather name={sealed ? "lock" : "file-text"} size={14} color={colors.textSecondary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {p.section.notebook.title} / {p.section.title}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 0 }}>
                    {relativeTime(p.updatedAt)}
                  </Text>
                </View>
              </GlassCard>
            </Pressable>
          );
        }
        return (
          <Pressable key={p.id} style={styles.recentRow} onPress={() => openRecent(p)}>
            <Feather name={sealed ? "lock" : "file-text"} size={14} color={colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14 }} numberOfLines={1}>
                {p.title}
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 0 }}>
              {relativeTime(p.updatedAt)}
            </Text>
          </Pressable>
        );
      })}

      {/* today's tasks */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        {scheduled.length > 0 ? "TODAY" : "OPEN TASKS"}
      </Text>
      {list.length === 0 && (
        <View style={styles.quietEmpty}>
          <Feather name="check" size={13} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
            All clear for now
          </Text>
        </View>
      )}
      {list.map(({ task, overdue: isOverdue }) => (
        <HomeTaskRow
          key={task.id}
          title={task.title}
          overdue={isOverdue}
          completing={!!completing[task.id]}
          accent={colors.accent}
          textPrimary={colors.textPrimary}
          textSecondary={colors.textSecondary}
          danger={colors.danger}
          onComplete={() => completeHomeTask(task.id)}
          onFinished={() => {
            animateTaskComplete();
            toggleTask.mutate(task.id, {
              onSettled: () => {
                setCompleting((m) => {
                  const next = { ...m };
                  delete next[task.id];
                  return next;
                });
              },
            });
          }}
        />
      ))}
    </ScrollView>

    <Fab
      actions={[
        { key: "note", label: "Quick note", icon: "file-text", onPress: () => captureRef.current?.focus() },
        {
          key: "task",
          label: "New task",
          icon: "check-square",
          onPress: () =>
            setTaskDraft({
              title: "",
              description: "",
              due: null,
              repeat: null,
              repeatDays: null,
              repeatInterval: 1,
              repeatEnd: null,
              repeatUntil: null,
              repeatCount: null,
            }),
        },
        { key: "notebook", label: "New notebook", icon: "book", onPress: () => setPrompt("notebook") },
      ]}
    />

    <TaskFormModal
      visible={taskDraft !== null}
      title="New task"
      submitLabel={taskBusy ? "Adding…" : "Add task"}
      draft={taskDraft}
      busy={taskBusy}
      autoFocus
      onClose={() => setTaskDraft(null)}
      onChange={setTaskDraft}
      onSubmit={async () => {
        if (!taskDraft?.title.trim() || taskBusy) return;
        setTaskBusy(true);
        try {
          await createTask({
            title: taskDraft.title.trim(),
            description: taskDraft.description.trim() || undefined,
            dueAt: taskDraft.due ? taskDraft.due.toISOString() : undefined,
            ...repeatPayload(taskDraft),
          });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          setTaskDraft(null);
        } finally {
          setTaskBusy(false);
        }
      }}
    />

    <PromptModal
      visible={prompt === "notebook"}
      title="New notebook"
      placeholder="Title"
      submitLabel="Create"
      onClose={() => setPrompt(null)}
      onSubmit={async (value) => {
        try {
          const nb = await createNotebook(value);
          queryClient.invalidateQueries({ queryKey: ["notebooks"] });
          navigation.navigate("Notebook", { notebookId: nb.id, title: nb.title });
          return null;
        } catch (err: any) {
          return err.response?.data?.error ?? "Something went wrong";
        }
      }}
    />
    </KeyboardSafe>
  );
}

function HomeTaskRow({
  title,
  overdue,
  completing,
  accent,
  textPrimary,
  textSecondary,
  danger,
  onComplete,
  onFinished,
}: {
  title: string;
  overdue: boolean;
  completing: boolean;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  danger: string;
  onComplete: () => void;
  onFinished: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(onFinished);
  const fired = useRef(false);
  finishedRef.current = onFinished;

  useEffect(() => {
    if (!completing || fired.current) return;
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 340, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 12, duration: 340, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished && !fired.current) {
        fired.current = true;
        finishedRef.current();
      }
    });
    return () => anim.stop();
  }, [completing, opacity, translateX]);

  return (
    <Animated.View
      style={[styles.taskRow, { opacity, transform: [{ translateX }] }]}
    >
      <Pressable onPress={onComplete} hitSlop={8} disabled={completing}>
        <Feather
          name={completing ? "check-square" : "square"}
          size={16}
          color={completing ? accent : textSecondary}
        />
      </Pressable>
      <Text
        style={{
          color: completing ? textSecondary : textPrimary,
          fontSize: 14,
          flex: 1,
          minWidth: 0,
          textDecorationLine: completing ? "line-through" : "none",
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {overdue && !completing && (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: "rgba(220, 38, 38, 0.12)",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "rgba(220, 38, 38, 0.28)",
          }}
        >
          <Text style={{ color: danger, fontSize: 11, fontWeight: "700", flexShrink: 0 }}>Overdue</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerStacked: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  greeting: { fontWeight: "500" },
  greetingName: { fontWeight: "600", marginTop: 2 },
  dailyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexShrink: 0,
  },
  capture: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  captureInput: { flex: 1, fontSize: 14, maxHeight: 90, paddingVertical: 4 },
  shortcuts: { flexDirection: "row", alignItems: "stretch" },
  shortcut: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sectionLabel: { fontSize: 11, letterSpacing: 1, marginTop: 24, marginBottom: 8 },
  quietEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  recentFeatured: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
});
