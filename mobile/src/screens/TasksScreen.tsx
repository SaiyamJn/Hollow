import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { createTask, deleteTask, fetchTasks, updateTask } from "../lib/api";
import { syncTaskReminders } from "../lib/notifications";
import type { Task } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { Fab } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";
import { GlassDateTimePicker, formatDueLabel } from "../components/GlassDateTimePicker";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useKeyboardBottomInset } from "../hooks/useKeyboardBottomInset";
import { useLayout } from "../lib/layout";

type GroupName = "Starred" | "Overdue" | "Today" | "Upcoming" | "No date" | "Completed";

function groupTasks(tasks: Task[], showCompleted: boolean) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const open = tasks.filter((t) => !t.done);
  const completed = tasks.filter((t) => t.done);

  const starred = open.filter((t) => t.starred);
  const rest = open.filter((t) => !t.starred);
  const groups: Record<Exclude<GroupName, "Starred" | "Completed">, Task[]> = {
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

  const sections: { title: GroupName; data: Task[]; completedCount?: number }[] = [];
  if (starred.length) sections.push({ title: "Starred", data: starred });
  for (const name of ["Overdue", "Today", "Upcoming", "No date"] as const) {
    if (groups[name].length) sections.push({ title: name, data: groups[name] });
  }
  if (completed.length) {
    sections.push({
      title: "Completed",
      data: showCompleted ? completed : [],
      completedCount: completed.length,
    });
  }
  return sections;
}

function defaultDue() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

type Draft = { title: string; description: string; due: Date | null };
type EditDraft = Draft & { id: string };

export default function TasksScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const quickAddRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardBottomInset();
  const { isNarrow, screenPad, listBottomClearance } = useLayout();

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
      patch: {
        title?: string;
        done?: boolean;
        starred?: boolean;
        dueAt?: string | null;
        description?: string;
      };
    }) => updateTask(id, patch),
    onSuccess: invalidate,
  });
  const saveEdit = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { title: string; description: string; dueAt: string | null };
    }) => updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });

  function openCreate(title: string) {
    setDraft({ title: title.trim(), description: "", due: defaultDue() });
  }

  function openEdit(task: Task) {
    setEditing({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      due: task.dueAt ? new Date(task.dueAt) : null,
    });
  }

  const groupColor = (name: string) =>
    name === "Overdue"
      ? colors.danger
      : name === "Today" || name === "Starred"
        ? colors.accent
        : colors.textSecondary;

  const sections = groupTasks(tasks ?? [], showCompleted);

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: screenPad, paddingBottom: listBottomClearance(true) + keyboardInset }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <GlassCard style={{ alignSelf: "stretch" }} contentStyle={{ paddingHorizontal: 12, paddingVertical: 2 }}>
              <TextInput
                ref={quickAddRef}
                style={[styles.quickAdd, { color: colors.textPrimary, textAlign: "center" }]}
                placeholder={isNarrow ? "Add a task…" : "Add a task, press return"}
                placeholderTextColor={colors.textSecondary}
                value={quickAdd}
                onChangeText={setQuickAdd}
                onSubmitEditing={() => {
                  if (quickAdd.trim()) openCreate(quickAdd);
                }}
              />
            </GlassCard>
          </View>
        }
        renderSectionHeader={({ section }) => {
          if (section.title === "Completed") {
            const count = section.completedCount ?? section.data.length;
            return (
              <Pressable
                onPress={() => setShowCompleted((v) => !v)}
                style={styles.completedHeader}
                hitSlop={6}
              >
                <Feather
                  name={showCompleted ? "chevron-down" : "chevron-right"}
                  size={15}
                  color={colors.textSecondary}
                />
                <Text style={[styles.groupHeader, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                  COMPLETED ({count})
                </Text>
              </Pressable>
            );
          }
          return (
            <Text style={[styles.groupHeader, { color: groupColor(section.title) }]}>
              {section.title.toUpperCase()}
            </Text>
          );
        }}
        renderItem={({ item: task }) => {
          const isOpen = expanded.has(task.id);
          const subtasks = task.subtasks ?? [];
          return (
            <GlassCard style={{ marginBottom: 8 }} contentStyle={styles.taskCard}>
              <View style={[styles.taskRow, isNarrow && { gap: 8 }]}>
                <Pressable
                  style={{ flexShrink: 0 }}
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
                <Pressable
                  style={{ flexShrink: 0 }}
                  onPress={() => update.mutate({ id: task.id, patch: { done: !task.done } })}
                >
                  <Feather
                    name={task.done ? "check-square" : "square"}
                    size={17}
                    color={task.done ? colors.accent : colors.textSecondary}
                  />
                </Pressable>
                <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => openEdit(task)}>
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
                  {!!task.dueAt && (
                    <Text style={{ color: colors.accent, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {formatDueLabel(task.dueAt)}
                    </Text>
                  )}
                </Pressable>
                {!isNarrow && (
                  <Pressable style={{ flexShrink: 0 }} onPress={() => openEdit(task)} hitSlop={6}>
                    <Feather name="edit-2" size={14} color={colors.textSecondary} />
                  </Pressable>
                )}
                <Pressable
                  style={{ flexShrink: 0 }}
                  onPress={() => update.mutate({ id: task.id, patch: { starred: !task.starred } })}
                >
                  <Feather name="star" size={14} color={task.starred ? colors.accent : colors.textSecondary} />
                </Pressable>
                <Pressable style={{ flexShrink: 0 }} onPress={() => remove.mutate(task.id)}>
                  <Feather name="trash-2" size={14} color={colors.textSecondary} />
                </Pressable>
              </View>

              {isOpen && (
                <View style={styles.subtasks}>
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
                          { color: sub.done ? colors.textSecondary : colors.textPrimary, fontSize: 13, flex: 1 },
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
                    style={{ color: colors.textPrimary, fontSize: 13, paddingVertical: 6, textAlign: "center" }}
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

      <TaskFormModal
        visible={draft !== null}
        title="New task"
        submitLabel={create.isPending ? "Adding…" : "Add task"}
        draft={draft}
        busy={create.isPending}
        onClose={() => setDraft(null)}
        onChange={setDraft}
        onSubmit={() => {
          if (!draft?.title.trim() || create.isPending) return;
          create.mutate({
            title: draft.title.trim(),
            description: draft.description.trim() || undefined,
            dueAt: draft.due ? draft.due.toISOString() : undefined,
          });
        }}
      />

      <TaskFormModal
        visible={editing !== null}
        title="Edit task"
        submitLabel={saveEdit.isPending ? "Saving…" : "Save"}
        draft={editing}
        busy={saveEdit.isPending}
        onClose={() => setEditing(null)}
        onChange={(next) => next && setEditing({ ...editing!, ...next })}
        onSubmit={() => {
          if (!editing?.title.trim() || saveEdit.isPending) return;
          saveEdit.mutate({
            id: editing.id,
            patch: {
              title: editing.title.trim(),
              description: editing.description.trim(),
              dueAt: editing.due ? editing.due.toISOString() : null,
            },
          });
        }}
      />
    </KeyboardSafe>
  );
}

function TaskFormModal({
  visible,
  title,
  submitLabel,
  draft,
  busy,
  onClose,
  onChange,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  submitLabel: string;
  draft: Draft | null;
  busy: boolean;
  onClose: () => void;
  onChange: (next: Draft | null) => void;
  onSubmit: () => void;
}) {
  const { colors } = useTheme();
  if (!draft) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.draftOverlay}>
        <GlassCard strong style={{ maxHeight: "90%" }} contentStyle={styles.draftCard}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
          >
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 15,
                fontWeight: "500",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <TextInput
              style={[
                styles.draftInput,
                {
                  color: colors.textPrimary,
                  borderColor: colors.glassBorder,
                  backgroundColor: colors.glass,
                  textAlign: "center",
                },
              ]}
              placeholder="Title"
              placeholderTextColor={colors.textSecondary}
              value={draft.title}
              onChangeText={(nextTitle) => onChange({ ...draft, title: nextTitle })}
              autoFocus
            />
            <TextInput
              style={[
                styles.draftInput,
                styles.draftDesc,
                {
                  color: colors.textPrimary,
                  borderColor: colors.glassBorder,
                  backgroundColor: colors.glass,
                  textAlign: "center",
                },
              ]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textSecondary}
              value={draft.description}
              onChangeText={(description) => onChange({ ...draft, description })}
              multiline
            />
            <GlassDateTimePicker value={draft.due} onChange={(due) => onChange({ ...draft, due })} />
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 14 }}>
              <Pressable onPress={onClose}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
              </Pressable>
              <Pressable disabled={!draft.title.trim() || busy} onPress={onSubmit}>
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>{submitLabel}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  quickAdd: { paddingVertical: 10, fontSize: 14 },
  groupHeader: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 8,
    textAlign: "center",
  },
  completedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 4,
  },
  taskCard: { paddingHorizontal: 12, paddingVertical: 4 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  taskTitle: { fontSize: 14, minWidth: 0 },
  strike: { textDecorationLine: "line-through" },
  subtasks: { marginLeft: 16, paddingBottom: 6 },
  draftOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 },
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
