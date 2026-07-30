import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { createTask, deleteTask, fetchTasks, updateTask } from "../lib/api";
import { syncTaskReminders } from "../lib/notifications";
import type { Task } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { Fab } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";

type GroupName = "Starred" | "Overdue" | "Today" | "Upcoming" | "No date";

function groupTasks(tasks: Task[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const starred = tasks.filter((t) => t.starred);
  const rest = tasks.filter((t) => !t.starred);
  const groups: Record<Exclude<GroupName, "Starred">, Task[]> = {
    Overdue: [],
    Today: [],
    Upcoming: [],
    "No date": [],
  };
  for (const task of rest) {
    if (!task.dueAt) groups["No date"].push(task);
    else {
      const due = new Date(task.dueAt);
      if (due < startOfToday) groups.Overdue.push(task);
      else if (due < endOfToday) groups.Today.push(task);
      else groups.Upcoming.push(task);
    }
  }

  const sections: { title: GroupName; data: Task[] }[] = [];
  if (starred.length) sections.push({ title: "Starred", data: starred });
  for (const name of ["Overdue", "Today", "Upcoming", "No date"] as const) {
    if (groups[name].length) sections.push({ title: name, data: groups[name] });
  }
  return sections;
}

function formatDue(dueAt: string) {
  const due = new Date(dueAt);
  const date = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  return hasTime ? `${date} · ${due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : date;
}

function defaultDue() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

type Picking = { taskId: string; stage: "date" | "time"; value: Date };
type Draft = { title: string; description: string; due: Date };

export default function TasksScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<Picking | null>(null);
  const [draftPicking, setDraftPicking] = useState(false);
  const quickAddRef = useRef<TextInput>(null);

  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  useEffect(() => {
    void syncTaskReminders(tasks);
  }, [tasks]);

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      invalidate();
      setDraft(null);
      setQuickAdd("");
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { done?: boolean; starred?: boolean; dueAt?: string | null; description?: string };
    }) => updateTask(id, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });

  function openCreate(title: string) {
    setDraft({ title: title.trim(), description: "", due: defaultDue() });
  }

  function openPicker(task: Task) {
    const start = task.dueAt ? new Date(task.dueAt) : new Date();
    setPicking({ taskId: task.id, stage: Platform.OS === "android" ? "date" : "time", value: start });
  }

  function commitDue(taskId: string, value: Date) {
    setPicking(null);
    update.mutate({ id: taskId, patch: { dueAt: value.toISOString() } });
  }

  function onAndroidPick(event: DateTimePickerEvent, date?: Date) {
    if (!picking) return;
    if (event.type === "dismissed" || !date) {
      setPicking(null);
      return;
    }
    if (picking.stage === "date") {
      const next = new Date(picking.value);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setPicking({ ...picking, stage: "time", value: next });
    } else {
      const next = new Date(picking.value);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      commitDue(picking.taskId, next);
    }
  }

  const groupColor = (name: string) =>
    name === "Overdue"
      ? colors.danger
      : name === "Today" || name === "Starred"
        ? colors.accent
        : colors.textSecondary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <SectionList
        sections={groupTasks(tasks ?? [])}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 170 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <GlassCard style={{ marginBottom: 16 }} contentStyle={{ paddingHorizontal: 12, paddingVertical: 2 }}>
            <TextInput
              ref={quickAddRef}
              style={[styles.quickAdd, { color: colors.textPrimary }]}
              placeholder="Add a task, press return"
              placeholderTextColor={colors.textSecondary}
              value={quickAdd}
              onChangeText={setQuickAdd}
              onSubmitEditing={() => {
                if (quickAdd.trim()) openCreate(quickAdd);
              }}
            />
          </GlassCard>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.groupHeader, { color: groupColor(section.title) }]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item: task }) => {
          const isOpen = expanded.has(task.id);
          const subtasks = task.subtasks ?? [];
          return (
            <GlassCard style={{ marginBottom: 8 }} contentStyle={styles.taskCard}>
              <View style={styles.taskRow}>
                <Pressable
                  onPress={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(task.id) ? next.delete(task.id) : next.add(task.id);
                      return next;
                    })
                  }
                >
                  <Feather name={isOpen ? "chevron-down" : "chevron-right"} size={15} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => update.mutate({ id: task.id, patch: { done: !task.done } })}>
                  <Feather
                    name={task.done ? "check-square" : "square"}
                    size={17}
                    color={task.done ? colors.accent : colors.textSecondary}
                  />
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[
                      styles.taskTitle,
                      { color: task.done ? colors.textSecondary : colors.textPrimary },
                      task.done && styles.strike,
                    ]}
                    numberOfLines={1}
                  >
                    {task.title}
                  </Text>
                  {!!task.description && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {task.description}
                    </Text>
                  )}
                </View>
                <Pressable onPress={() => openPicker(task)} hitSlop={6}>
                  {task.dueAt ? (
                    <Text style={{ color: colors.accent, fontSize: 11 }}>{formatDue(task.dueAt)}</Text>
                  ) : (
                    <Feather name="calendar" size={14} color={colors.textSecondary} />
                  )}
                </Pressable>
                <Pressable onPress={() => update.mutate({ id: task.id, patch: { starred: !task.starred } })}>
                  <Feather name="star" size={14} color={task.starred ? colors.accent : colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => remove.mutate(task.id)}>
                  <Feather name="trash-2" size={14} color={colors.textSecondary} />
                </Pressable>
              </View>

              {isOpen && (
                <View style={styles.subtasks}>
                  {task.dueAt && (
                    <Pressable
                      onPress={() => update.mutate({ id: task.id, patch: { dueAt: null } })}
                      style={{ paddingVertical: 4 }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Clear due date</Text>
                    </Pressable>
                  )}
                  {subtasks.map((sub) => (
                    <View key={sub.id} style={styles.taskRow}>
                      <Pressable onPress={() => update.mutate({ id: sub.id, patch: { done: !sub.done } })}>
                        <Feather
                          name={sub.done ? "check-square" : "square"}
                          size={15}
                          color={sub.done ? colors.accent : colors.textSecondary}
                        />
                      </Pressable>
                      <Text
                        style={[
                          styles.taskTitle,
                          { color: sub.done ? colors.textSecondary : colors.textPrimary, fontSize: 13 },
                          sub.done && styles.strike,
                        ]}
                        numberOfLines={1}
                      >
                        {sub.title}
                      </Text>
                      <Pressable onPress={() => remove.mutate(sub.id)}>
                        <Feather name="trash-2" size={13} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  ))}
                  <TextInput
                    style={{ color: colors.textPrimary, fontSize: 13, paddingVertical: 6 }}
                    placeholder="+ Add subtask"
                    placeholderTextColor={colors.textSecondary}
                    value={subtaskDrafts[task.id] ?? ""}
                    onChangeText={(v) => setSubtaskDrafts((d) => ({ ...d, [task.id]: v }))}
                    onSubmitEditing={() => {
                      const text = (subtaskDrafts[task.id] ?? "").trim();
                      if (text) {
                        create.mutate({ title: text, parentTaskId: task.id });
                        setSubtaskDrafts((d) => ({ ...d, [task.id]: "" }));
                      }
                    }}
                  />
                </View>
              )}
            </GlassCard>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 24 }}>
            No tasks yet.
          </Text>
        }
      />

      <Fab
        actions={[
          { key: "task", label: "New task", icon: "check-square", onPress: () => quickAddRef.current?.focus() },
        ]}
      />

      <Modal visible={draft !== null} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.draftOverlay}>
          {draft && (
            <GlassCard strong contentStyle={styles.draftCard}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "500", marginBottom: 12 }}>New task</Text>
              <TextInput
                style={[styles.draftInput, { color: colors.textPrimary, borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
                placeholder="Title"
                placeholderTextColor={colors.textSecondary}
                value={draft.title}
                onChangeText={(title) => setDraft({ ...draft, title })}
                autoFocus
              />
              <TextInput
                style={[
                  styles.draftInput,
                  styles.draftDesc,
                  { color: colors.textPrimary, borderColor: colors.glassBorder, backgroundColor: colors.glass },
                ]}
                placeholder="Description (optional)"
                placeholderTextColor={colors.textSecondary}
                value={draft.description}
                onChangeText={(description) => setDraft({ ...draft, description })}
                multiline
              />
              <Pressable
                style={[styles.draftInput, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
                onPress={() => setDraftPicking(true)}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
                  Due · {formatDue(draft.due.toISOString())}
                </Text>
              </Pressable>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 8 }}>
                <Pressable onPress={() => setDraft(null)}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!draft.title.trim() || create.isPending}
                  onPress={() =>
                    create.mutate({
                      title: draft.title.trim(),
                      description: draft.description.trim() || undefined,
                      dueAt: draft.due.toISOString(),
                    })
                  }
                >
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
                    {create.isPending ? "Adding…" : "Add task"}
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {draft && draftPicking && Platform.OS === "android" && (
        <DateTimePicker
          value={draft.due}
          mode="date"
          onChange={(e, date) => {
            if (e.type === "dismissed" || !date) {
              setDraftPicking(false);
              return;
            }
            const next = new Date(draft.due);
            next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            setDraft({ ...draft, due: next });
            setDraftPicking(false);
          }}
        />
      )}

      {draft && draftPicking && Platform.OS !== "android" && (
        <Modal transparent animationType="fade" onRequestClose={() => setDraftPicking(false)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setDraftPicking(false)}>
            <GlassCard strong style={{ borderRadius: 20 }} contentStyle={{ padding: 16, paddingBottom: 32 }}>
              <DateTimePicker
                value={draft.due}
                mode="datetime"
                display="spinner"
                onChange={(_e, date) => date && setDraft({ ...draft, due: date })}
              />
              <Pressable onPress={() => setDraftPicking(false)} style={{ alignSelf: "flex-end", paddingTop: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>Done</Text>
              </Pressable>
            </GlassCard>
          </Pressable>
        </Modal>
      )}

      {picking && Platform.OS === "android" && (
        <DateTimePicker value={picking.value} mode={picking.stage} is24Hour={false} onChange={onAndroidPick} />
      )}

      {picking && Platform.OS !== "android" && (
        <Modal transparent animationType="fade" onRequestClose={() => setPicking(null)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicking(null)}>
            <GlassCard
              strong
              style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderRadius: 20 }}
              contentStyle={{ padding: 16, paddingBottom: 32 }}
            >
              <Pressable onPress={() => undefined}>
                <DateTimePicker
                  value={picking.value}
                  mode="datetime"
                  display="spinner"
                  onChange={(_e, date) => date && setPicking({ ...picking, value: date })}
                />
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 18, paddingTop: 6 }}>
                  <Pressable onPress={() => setPicking(null)}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={() => commitDue(picking.taskId, picking.value)}>
                    <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>Set due</Text>
                  </Pressable>
                </View>
              </Pressable>
            </GlassCard>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  quickAdd: { paddingVertical: 10, fontSize: 14 },
  groupHeader: { fontSize: 11, fontWeight: "500", letterSpacing: 0.8, marginBottom: 8, marginTop: 8 },
  taskCard: { paddingHorizontal: 12, paddingVertical: 4 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  taskTitle: { fontSize: 14 },
  strike: { textDecorationLine: "line-through" },
  subtasks: { marginLeft: 26, paddingBottom: 6 },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  draftOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  draftCard: { padding: 20 },
  draftInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  draftDesc: { minHeight: 72, textAlignVertical: "top" },
});
