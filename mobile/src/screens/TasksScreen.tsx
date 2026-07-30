import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { createTask, deleteTask, fetchTasks, updateTask } from "../lib/api";
import { syncTaskReminders } from "../lib/notifications";
import type { Task } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { Fab } from "../components/Fab";

type GroupName = "Overdue" | "Today" | "Upcoming" | "No date";

function groupTasks(tasks: Task[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const groups: Record<GroupName, Task[]> = { Overdue: [], Today: [], Upcoming: [], "No date": [] };
  for (const task of tasks) {
    if (!task.dueAt) groups["No date"].push(task);
    else {
      const due = new Date(task.dueAt);
      if (due < startOfToday) groups.Overdue.push(task);
      else if (due < endOfToday) groups.Today.push(task);
      else groups.Upcoming.push(task);
    }
  }
  return (Object.entries(groups) as [GroupName, Task[]][])
    .filter(([, list]) => list.length > 0)
    .map(([title, data]) => ({ title, data }));
}

function formatDue(dueAt: string) {
  const due = new Date(dueAt);
  const date = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  return hasTime ? `${date} · ${due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : date;
}

// Android shows the native date dialog then the time dialog; iOS shows a
// single combined datetime spinner in a sheet.
type Picking = { taskId: string; stage: "date" | "time"; value: Date };

export default function TasksScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<Picking | null>(null);
  const quickAddRef = useRef<TextInput>(null);

  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  // Keep the local notification schedule in sync with whatever is due.
  useEffect(() => {
    void syncTaskReminders(tasks);
  }, [tasks]);

  const create = useMutation({ mutationFn: createTask, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { done?: boolean; dueAt?: string | null } }) =>
      updateTask(id, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });

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
    name === "Overdue" ? colors.danger : name === "Today" ? colors.accent : colors.textSecondary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <SectionList
        sections={groupTasks(tasks ?? [])}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 170 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <TextInput
            ref={quickAddRef}
            style={[styles.quickAdd, { backgroundColor: colors.surface1, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Add a task, press return"
            placeholderTextColor={colors.textSecondary}
            value={quickAdd}
            onChangeText={setQuickAdd}
            onSubmitEditing={() => {
              if (quickAdd.trim()) {
                create.mutate({ title: quickAdd.trim() });
                setQuickAdd("");
              }
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.groupHeader, { color: groupColor(section.title) }]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item: task }) => {
          const isOpen = expanded.has(task.id);
          const subtasks = task.subtasks ?? [];
          return (
            <View style={[styles.taskCard, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
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
                <Pressable onPress={() => openPicker(task)} hitSlop={6}>
                  {task.dueAt ? (
                    <Text style={{ color: colors.accent, fontSize: 11 }}>{formatDue(task.dueAt)}</Text>
                  ) : (
                    <Feather name="calendar" size={14} color={colors.textSecondary} />
                  )}
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
                      const draft = (subtaskDrafts[task.id] ?? "").trim();
                      if (draft) {
                        create.mutate({ title: draft, parentTaskId: task.id });
                        setSubtaskDrafts((d) => ({ ...d, [task.id]: "" }));
                      }
                    }}
                  />
                </View>
              )}
            </View>
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

      {picking && Platform.OS === "android" && (
        <DateTimePicker
          value={picking.value}
          mode={picking.stage}
          is24Hour={false}
          onChange={onAndroidPick}
        />
      )}

      {picking && Platform.OS !== "android" && (
        <Modal transparent animationType="fade" onRequestClose={() => setPicking(null)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicking(null)}>
            <Pressable
              style={[styles.pickerSheet, { backgroundColor: colors.surface1, borderColor: colors.border }]}
              onPress={() => undefined}
            >
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
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  quickAdd: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  groupHeader: { fontSize: 11, fontWeight: "500", letterSpacing: 0.8, marginBottom: 8, marginTop: 8 },
  taskCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  taskTitle: { flex: 1, fontSize: 14 },
  strike: { textDecorationLine: "line-through" },
  subtasks: { marginLeft: 26, paddingBottom: 6 },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingBottom: 32,
  },
});
