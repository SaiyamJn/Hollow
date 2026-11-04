import { useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { createTask, createQuickNote, deleteTask, fetchTasks, updateTask, fetchTaskClasses, updateTaskClassesOrder, renameTaskClass, deleteTaskClass } from "../lib/api";
import { dismissTaskNotifications } from "../lib/notifications";
import { animateListChange, animateTaskComplete } from "../lib/motion";
import type { Task } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { Fab } from "../components/Fab";
import EmptyState from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { formatDueLabel } from "../components/GlassDateTimePicker";
import { TaskFormModal, formatRepeatLabel, repeatPayload, type TaskDraft } from "../components/TaskFormModal";
import { ManageClassesModal } from "../components/ManageClassesModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { FocusDot } from "../components/FocusField";
import { FocusBoardMobile } from "../components/TaskBoards";
import { FOCUS_META, FOCUS_MATRIX, sortByFocusPriority, type TaskFocus } from "../lib/taskFocus";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useKeyboardBottomInset } from "../hooks/useKeyboardBottomInset";
import { useLayout } from "../lib/layout";

type GroupName = "Starred" | "Overdue" | "Today" | "Upcoming" | "No date" | "Completed";
type TasksLayout = "list" | "focus";

const LAYOUTS: { id: TasksLayout; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "list", label: "List", icon: "list" },
  { id: "focus", label: "Focus", icon: "grid" },
];

/** Next occurrence of a repeat stays off Tasks (incl. Upcoming) until its day starts.
 *  One-off future tasks still appear under Upcoming. */
function isDeferredRepeat(task: Task, endOfToday: Date) {
  if (task.done || !task.repeatRule || !task.dueAt) return false;
  return new Date(task.dueAt) >= endOfToday;
}

function groupTasks(tasks: Task[], collapsedSections: Set<GroupName>) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const open = tasks.filter((t) => !t.done && !isDeferredRepeat(t, endOfToday));
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

  const sections: { title: GroupName; data: Task[]; totalCount: number; isCollapsed: boolean }[] = [];
  if (starred.length) {
    const isCollapsed = collapsedSections.has("Starred");
    sections.push({
      title: "Starred",
      data: isCollapsed ? [] : sortByFocusPriority(starred),
      totalCount: starred.length,
      isCollapsed,
    });
  }
  for (const name of ["Overdue", "Today", "Upcoming", "No date"] as const) {
    if (groups[name].length) {
      const isCollapsed = collapsedSections.has(name);
      sections.push({
        title: name,
        data: isCollapsed ? [] : sortByFocusPriority(groups[name]),
        totalCount: groups[name].length,
        isCollapsed,
      });
    }
  }
  if (completed.length) {
    const isCollapsed = collapsedSections.has("Completed");
    const sortedCompleted = [...completed].sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
    sections.push({
      title: "Completed",
      data: isCollapsed ? [] : sortedCompleted,
      totalCount: completed.length,
      isCollapsed,
    });
  }
  return sections;
}

type EditDraft = TaskDraft & { id: string };

export default function TasksScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<GroupName>>(new Set(["Completed"]));
  const [layout, setLayout] = useState<TasksLayout>("list");
  const [reclassTask, setReclassTask] = useState<Task | null>(null);
  const [confirmDeleteEdit, setConfirmDeleteEdit] = useState(false);
  const [manageClassesOpen, setManageClassesOpen] = useState(false);
  const quickAddRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardBottomInset();
  const { isNarrow, screenPad, listBottomClearance } = useLayout();

  const toggleSection = (name: GroupName) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const { data: classesData } = useQuery({ queryKey: ["task-classes"], queryFn: fetchTaskClasses });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["task-classes"] });
  };

  const defaultClass = classesData?.defaultClass || "";

  const [selectedGroup, setSelectedGroup] = useState<string>("All");

  const availableGroups = useMemo(() => {
    const configured = classesData?.classes ?? [];
    const set = new Set<string>(configured);
    const extra: string[] = [];
    for (const t of tasks ?? []) {
      const g = (t.group ?? "").trim();
      if (g && !set.has(g)) {
        set.add(g);
        extra.push(g);
      }
    }
    return [...configured, ...extra];
  }, [classesData, tasks]);

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (selectedGroup === "All") return tasks;
    return tasks.filter((t) => (t.group ?? "").trim().toLowerCase() === selectedGroup.toLowerCase());
  }, [tasks, selectedGroup]);

  const createListMutation = useMutation({
    mutationFn: () =>
      createQuickNote({
        title: "",
        content: " ",
        color: "green",
        kind: "list",
        items: [{ id: `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, text: "", done: false }],
        archived: false,
      }),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
      navigation.navigate("QuickNote", {
        noteId: note.id,
        title: note.title ?? "",
        content: (note.content ?? "").trim(),
        color: note.color,
        kind: "list",
        autoFocus: true,
      });
    },
  });

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      invalidate();
      setDraft(null);
      setQuickAdd("");
    },
    onError: (err) => {
      console.warn("Failed to create task", err);
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
        focus?: TaskFocus;
        dueAt?: string | null;
        description?: string;
      };
    }) => updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      if (patch.done) void dismissTaskNotifications(id);
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const prev = queryClient.getQueryData<Task[]>(["tasks"]);
      if (patch.done !== undefined || patch.starred !== undefined || patch.focus !== undefined) {
        queryClient.setQueryData<Task[]>(["tasks"], (old) =>
          (old ?? []).map((t) => {
            if (t.id !== id) {
              return {
                ...t,
                subtasks: t.subtasks?.map((s) => (s.id === id ? { ...s, ...patch } : s)),
              };
            }
            return { ...t, ...patch };
          })
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["tasks"], ctx.prev);
    },
    onSettled: () => {
      invalidate();
    },
  });
  const saveEdit = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        title: string;
        description: string;
        group?: string;
        dueAt: string | null;
        focus?: "none" | "critical" | "steady" | "swift" | "quiet";
        repeatRule: "daily" | "weekly" | "monthly" | "yearly" | null;
        repeatDays?: number[] | null;
        repeatInterval?: number | null;
        repeatEnd?: "never" | "on" | "after" | null;
        repeatUntil?: string | null;
        repeatCount?: number | null;
      };
    }) => updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
    onError: (err) => {
      console.warn("Failed to save task edit", err);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      void dismissTaskNotifications(id);
      return deleteTask(id);
    },
    onSuccess: invalidate,
  });

  function openCreate(title: string) {
    setDraft({
      title: title.trim(),
      description: "",
      group: selectedGroup !== "All" ? selectedGroup : defaultClass,
      due: null,
      focus: "none",
      repeat: null,
      repeatDays: null,
      repeatInterval: 1,
      repeatEnd: null,
      repeatUntil: null,
      repeatCount: null,
    });
  }

  function openEdit(task: Task) {
    setEditing({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      group: task.group ?? "",
      due: task.dueAt ? new Date(task.dueAt) : null,
      focus: task.focus ?? "none",
      repeat: task.repeatRule ?? null,
      repeatDays: task.repeatDays ?? null,
      repeatInterval: task.repeatInterval ?? 1,
      repeatEnd: task.repeatEnd ?? null,
      repeatUntil: task.repeatUntil ? new Date(task.repeatUntil) : null,
      repeatCount: task.repeatCount ?? null,
    });
  }

  function openReclass(task: Task) {
    setReclassTask(task);
  }

  function applyReclass(focus: TaskFocus) {
    if (!reclassTask) return;
    update.mutate({ id: reclassTask.id, patch: { focus } });
    setReclassTask(null);
  }

  const groupColor = (name: string) =>
    name === "Overdue"
      ? colors.danger
      : name === "Today" || name === "Starred"
        ? colors.accent
        : colors.textSecondary;

  const sections = groupTasks(filteredTasks, collapsedSections);
  const endOfTodayForCount = (() => {
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    s.setDate(s.getDate() + 1);
    return s;
  })();
  const boardTasks = filteredTasks.filter((t) => !isDeferredRepeat(t, endOfTodayForCount));
  const openCount = filteredTasks.filter((t) => !t.done && !isDeferredRepeat(t, endOfTodayForCount)).length;
  const completedCount = filteredTasks.filter((t) => t.done).length;
  const allDone = filteredTasks.length > 0 && openCount === 0;
  const noneYet = filteredTasks.length === 0;

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
      <SectionList
        sections={layout === "list" ? sections : []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{
          padding: screenPad,
          paddingBottom: listBottomClearance(true) + keyboardInset,
          flexGrow: 1,
        }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        decelerationRate="normal"
        bounces={true}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ marginBottom: 10 }}>
            {/* Minimal top bar: segmented layout switcher + recycle bin */}
            <View style={styles.topControlRow}>
              <View style={[styles.segmentedPill, { backgroundColor: colors.surface1, borderColor: colors.glassBorder }]}>
                {LAYOUTS.map((l) => {
                  const active = layout === l.id;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => setLayout(l.id)}
                      style={[
                        styles.segmentBtn,
                        active && { backgroundColor: colors.accentSoft },
                      ]}
                    >
                      <Feather name={l.icon} size={13} color={active ? colors.accent : colors.textSecondary} />
                      <Text
                        style={{
                          color: active ? colors.accent : colors.textSecondary,
                          fontSize: 12,
                          fontWeight: active ? "700" : "500",
                        }}
                      >
                        {l.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => navigation.navigate("RecycleBin", { tab: "tasks" })}
                style={[
                  styles.compactBinBtn,
                  { backgroundColor: colors.surface1, borderColor: colors.glassBorder },
                ]}
              >
                <Feather name="trash-2" size={13} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "500" }}>
                  Recycle bin
                </Text>
              </Pressable>
            </View>

            {/* Horizontal classes chips row with long-press reorder support */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 6, paddingVertical: 4, marginBottom: 8 }}
            >
              {["All", ...availableGroups].map((g) => {
                const active = selectedGroup === g;
                const isDef = g !== "All" && defaultClass && g.toLowerCase() === defaultClass.toLowerCase();
                return (
                  <Pressable
                    key={g}
                    onPress={() => setSelectedGroup(g)}
                    onLongPress={() => {
                      if (g !== "All") {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setManageClassesOpen(true);
                      }
                    }}
                    delayLongPress={280}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: active ? colors.accentSoft : colors.surface2,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: active ? "700" : "500",
                        color: active ? colors.accent : colors.textSecondary,
                      }}
                    >
                      {g}
                    </Text>
                    {isDef && (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: active ? colors.accent : colors.textSecondary }} />
                    )}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setManageClassesOpen(true)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: colors.surface2,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Feather name="sliders" size={12} color={colors.textSecondary} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textSecondary }}>
                  Classes
                </Text>
              </Pressable>
            </ScrollView>
            <GlassCard
              style={{ alignSelf: "stretch", width: "100%" }}
              contentStyle={{ paddingHorizontal: 12, paddingVertical: 2 }}
            >
              <TextInput
                ref={quickAddRef}
                style={[styles.quickAdd, { color: colors.textPrimary, textAlign: "center" }]}
                placeholder={
                  selectedGroup !== "All"
                    ? `Add to "${selectedGroup}"…`
                    : defaultClass
                      ? `Add to "${defaultClass}"…`
                      : isNarrow
                        ? "What's next?"
                        : "What's next? Hit return"
                }
                placeholderTextColor={colors.textSecondary}
                value={quickAdd}
                onChangeText={setQuickAdd}
                onSubmitEditing={() => {
                  if (quickAdd.trim()) openCreate(quickAdd);
                }}
              />
            </GlassCard>
            {layout === "focus" && tasks && (
              <View style={{ marginTop: 14 }}>
                <FocusBoardMobile
                  tasks={boardTasks}
                  colors={colors}
                  onToggle={(t) => update.mutate({ id: t.id, patch: { done: !t.done } })}
                  onEdit={openEdit}
                  onReclass={openReclass}
                />
              </View>
            )}
            {layout === "list" && allDone && (
              <EmptyState
                icon="check-circle"
                title="All clear"
                subtitle={
                  completedCount === 1
                    ? "That one is done. Take a breath."
                    : `${completedCount} checked off — enjoy the quiet.`
                }
                compact
              />
            )}
          </View>
        }
        renderSectionHeader={layout !== "list" ? () => null : ({ section }) => {
          const color = groupColor(section.title);
          return (
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                toggleSection(section.title);
              }}
              style={styles.sectionHeaderBtn}
              hitSlop={6}
            >
              <View style={[styles.sectionDot, { backgroundColor: color }]} />
              <Text style={[styles.groupHeader, { color, marginTop: 0, marginBottom: 0 }]}>
                {section.title.toUpperCase()}
              </Text>
              <Text style={[styles.sectionCountBadge, { color: colors.textSecondary }]}>
                {section.totalCount}
              </Text>
              <View style={{ flex: 1 }} />
              <Feather
                name={section.isCollapsed ? "chevron-right" : "chevron-down"}
                size={14}
                color={colors.textSecondary}
              />
            </Pressable>
          );
        }}
        renderItem={({ item: task }) => {
          if (layout !== "list") return null;
          const isOpen = expanded.has(task.id);
          const subtasks = sortByFocusPriority(task.subtasks ?? []);
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <FocusDot focus={task.focus} colors={colors} />
                    <Text
                      style={[
                        styles.taskTitle,
                        { color: task.done ? colors.textSecondary : colors.textPrimary, flex: 1, paddingRight: 4 },
                        task.done && styles.strike,
                      ]}
                      numberOfLines={1}
                    >
                      {task.title}
                    </Text>
                    {!!task.group && (
                      <View
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 1.5,
                          borderRadius: 6,
                          backgroundColor: colors.surface2,
                        }}
                      >
                        <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: "600" }}>
                          {task.group}
                        </Text>
                      </View>
                    )}
                    {subtasks.length > 0 && (
                      <Pressable
                        onPress={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            next.has(task.id) ? next.delete(task.id) : next.add(task.id);
                            return next;
                          })
                        }
                        hitSlop={6}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 3,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 999,
                          backgroundColor: colors.accentSoft,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: `${colors.accent}55`,
                        }}
                      >
                        <Feather name="check-square" size={10} color={colors.accent} />
                        <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "700" }}>
                          {subtasks.filter((s) => s.done).length}/{subtasks.length}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {!!task.description && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {task.description}
                    </Text>
                  )}
                  {!!task.dueAt && (
                    <Text style={{ color: colors.accent, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {formatDueLabel(task.dueAt)}
                      {task.repeatRule
                        ? ` · ${formatRepeatLabel({
                            rule: task.repeatRule,
                            days: task.repeatDays,
                            interval: task.repeatInterval,
                            end: task.repeatEnd,
                            until: task.repeatUntil,
                            count: task.repeatCount,
                          })}`
                        : ""}
                    </Text>
                  )}
                  {!task.dueAt && !!task.repeatRule && (
                    <Text style={{ color: colors.accent, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {formatRepeatLabel({
                        rule: task.repeatRule,
                        days: task.repeatDays,
                        interval: task.repeatInterval,
                        end: task.repeatEnd,
                        until: task.repeatUntil,
                        count: task.repeatCount,
                      })}
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
                    style={{ color: colors.textPrimary, fontSize: 13, paddingVertical: 6, textAlign: "left" }}
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
          noneYet ? (
            <EmptyState
              icon="sunrise"
              title="Nothing on the list"
              subtitle="Whenever something's tugging at you, drop it here."
            />
          ) : null
        }
      />

      <Fab
        actions={[
          { key: "task", label: "New task", icon: "check-circle", onPress: () => openCreate("") },
          {
            key: "list",
            label: "New list",
            icon: "check-square",
            onPress: () => {
              if (!createListMutation.isPending) createListMutation.mutate();
            },
          },
        ]}
      />

      <TaskFormModal
        visible={draft !== null}
        title="New task"
        availableGroups={availableGroups}
        defaultGroup={defaultClass}
        submitLabel={create.isPending ? "Adding…" : "Add task"}
        draft={draft}
        busy={create.isPending}
        autoFocus
        onClose={() => setDraft(null)}
        onChange={setDraft}
        onSubmit={() => {
          if (!draft?.title.trim() || create.isPending) return;
          const assignedGroup = (draft.group?.trim() || (selectedGroup !== "All" ? selectedGroup : defaultClass) || "").trim();
          create.mutate({
            title: draft.title.trim(),
            description: draft.description.trim() || undefined,
            group: assignedGroup || undefined,
            dueAt: draft.due ? draft.due.toISOString() : undefined,
            focus: draft.focus ?? "none",
            ...repeatPayload(draft),
          });
        }}
      />

      <TaskFormModal
        visible={editing !== null}
        title="Edit task"
        availableGroups={availableGroups}
        defaultGroup={defaultClass}
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
              group: editing.group?.trim() || "",
              dueAt: editing.due ? editing.due.toISOString() : null,
              focus: editing.focus ?? "none",
              ...repeatPayload(editing),
            },
          });
        }}
        onDelete={() => setConfirmDeleteEdit(true)}
      />

      <ConfirmModal
        visible={confirmDeleteEdit}
        title="Move to recycle bin?"
        message="You can restore it within 7 days."
        confirmLabel="Move"
        onClose={() => setConfirmDeleteEdit(false)}
        onConfirm={() => {
          if (!editing) return;
          remove.mutate(editing.id);
          setEditing(null);
        }}
      />

      <Modal
        visible={reclassTask !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReclassTask(null)}
      >
        <Pressable style={styles.reclassBackdrop} onPress={() => setReclassTask(null)}>
          <Pressable
            style={[styles.reclassSheet, { backgroundColor: colors.surface1, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", textAlign: "center" }}>
              Move focus
            </Text>
            {!!reclassTask && (
              <Text
                style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 12 }}
                numberOfLines={2}
              >
                {reclassTask.title}
              </Text>
            )}
            {FOCUS_MATRIX.map((id) => (
              <Pressable
                key={id}
                onPress={() => applyReclass(id)}
                style={[styles.reclassRow, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
                  {FOCUS_META[id].label}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {FOCUS_META[id].hint}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => applyReclass("none")}
              style={[styles.reclassRow, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "600" }}>Clear focus</Text>
            </Pressable>
            <Pressable onPress={() => setReclassTask(null)} style={{ paddingVertical: 14 }}>
              <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "700", textAlign: "center" }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <ManageClassesModal
        visible={manageClassesOpen}
        classes={availableGroups}
        defaultClass={defaultClass}
        onClose={() => setManageClassesOpen(false)}
        onSaveOrder={async (newOrder, newDef) => {
          await updateTaskClassesOrder(newOrder, newDef);
          invalidate();
        }}
        onRenameClass={async (oldName, newName) => {
          await renameTaskClass(oldName, newName);
          invalidate();
          if (selectedGroup === oldName) setSelectedGroup(newName);
        }}
        onDeleteClass={async (name) => {
          await deleteTaskClass(name);
          invalidate();
          if (selectedGroup === name) setSelectedGroup("All");
        }}
      />
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  topControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  segmentedPill: {
    flexDirection: "row",
    alignItems: "center",
    padding: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  compactBinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickAdd: { paddingVertical: 10, fontSize: 14 },
  sectionHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 14,
    marginBottom: 6,
    paddingVertical: 4,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionCountBadge: {
    fontSize: 11,
    fontWeight: "600",
    opacity: 0.65,
  },
  groupHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textAlign: "left",
  },
  completedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
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
  reclassBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  reclassSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  reclassRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
});
