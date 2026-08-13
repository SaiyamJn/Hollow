import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { createTask, fetchTasks, updateTask } from "../lib/api";
import type { Task } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { TaskFormModal, formatRepeatLabel, type TaskDraft } from "../components/TaskFormModal";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useLayout } from "../lib/layout";
import {
  addDays,
  addMonths,
  dateOnlyDue,
  dayKey,
  formatDayHeading,
  formatMonthTitle,
  formatTime,
  moveDueToDate,
  sameDay,
  startOfDay,
  startOfMonth,
} from "./dateUtils";
import { datedTasks, groupByDay, tasksOnDay, type CalendarTask } from "./taskIndex";
import { CollapsibleMonth, ensureSelectedInMonth } from "./CollapsibleMonth";
import EmptyState from "../components/EmptyState";
import { animatePanel } from "../lib/motion";

type EditDraft = TaskDraft & { id: string };
type CalView = "schedule" | "week" | "day" | "agenda";

const VIEW_OPTIONS: { id: CalView; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "schedule", label: "Schedule", icon: "calendar" },
  { id: "week", label: "Week", icon: "grid" },
  { id: "day", label: "Day", icon: "sun" },
  { id: "agenda", label: "Agenda", icon: "list" },
];

/**
 * TickTick-inspired calendar — collapsible month + day list.
 * Self-contained: remove this folder + tab to uninstall.
 */
export default function CalendarScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { screenPad, listBottomClearance } = useLayout();

  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState<CalView>("schedule");
  const [viewMenu, setViewMenu] = useState(false);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);

  const scrollY = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;

  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const dated = useMemo(() => datedTasks(tasks), [tasks]);
  // One row per real due date — calendar shows the next occurrence early;
  // Tasks panel waits until that day starts.
  const byDay = useMemo(() => groupByDay(dated), [dated]);
  const dayTasks = tasksOnDay(byDay, selected);

  function setCalendarExpanded(next: boolean) {
    if (next === expanded) return;
    animatePanel();
    setExpanded(next);
  }

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      invalidate();
      setDraft(null);
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
        dueAt?: string | null;
        description?: string;
        repeatRule?: Task["repeatRule"];
      };
    }) => updateTask(id, patch),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  function pulseMonth() {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0.45, duration: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }

  function shiftMonth(dir: -1 | 1) {
    const next = addMonths(cursor, dir);
    setCursor(startOfMonth(next));
    setSelected(ensureSelectedInMonth(selected, next));
    pulseMonth();
    void Haptics.selectionAsync();
  }

  function jumpToday() {
    const t = startOfDay(new Date());
    setCursor(startOfMonth(t));
    setSelected(t);
    setCalendarExpanded(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function selectDay(d: Date) {
    setSelected(startOfDay(d));
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
      setCursor(startOfMonth(d));
    }
    void Haptics.selectionAsync();
  }

  function openCreate(day: Date = selected) {
    setDraft({ title: "", description: "", due: dateOnlyDue(day), repeat: null });
  }

  function openEdit(task: CalendarTask) {
    setEditing({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      due: task.dueAt ? new Date(task.dueAt) : task.due,
      repeat: task.repeatRule,
    });
  }

  function onListScroll(y: number) {
    const prev = scrollY.current;
    scrollY.current = y;
    if (view !== "schedule") return;
    // Scrolling the list collapses an open calendar; expand only via handle/drag.
    if (y > 24 && y > prev && expanded) setCalendarExpanded(false);
  }

  const weekStrip = useMemo(() => {
    const start = addDays(selected, -selected.getDay());
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const agendaKeys = useMemo(() => {
    return Array.from(byDay.keys())
      .sort()
      .filter((k) => {
        const [y, m, d] = k.split("-").map(Number);
        return new Date(y, m - 1, d) >= addDays(today, -7);
      });
  }, [byDay, today]);

  const headerTitle =
    view === "agenda"
      ? "Agenda"
      : view === "day"
        ? selected.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : formatMonthTitle(cursor);

  return (
    <KeyboardSafe style={{ flex: 1, backgroundColor: colors.surface0 }}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: screenPad, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          {view !== "agenda" && (
            <Pressable onPress={() => (view === "schedule" || view === "week" ? shiftMonth(-1) : selectDay(addDays(selected, -1)))} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-left" size={22} color={colors.textPrimary} />
            </Pressable>
          )}
          <Pressable onPress={jumpToday} style={{ flex: 1 }} hitSlop={6}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "600", textAlign: "center" }} numberOfLines={1}>
              {headerTitle}
            </Text>
          </Pressable>
          {view !== "agenda" && (
            <Pressable onPress={() => (view === "schedule" || view === "week" ? shiftMonth(1) : selectDay(addDays(selected, 1)))} hitSlop={10} style={styles.navBtn}>
              <Feather name="chevron-right" size={22} color={colors.textPrimary} />
            </Pressable>
          )}
          <Pressable onPress={jumpToday} style={[styles.todayBtn, { borderColor: colors.accent }]}>
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>Today</Text>
          </Pressable>
          <Pressable onPress={() => setViewMenu(true)} hitSlop={8} style={styles.navBtn}>
            <Feather name="more-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {isLoading && !tasks ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : (
        <>
          {/* Schedule = TickTick default: rolling month + day list */}
          {view === "schedule" && (
            <>
              <Animated.View style={{ opacity: fade, paddingHorizontal: screenPad * 0.5 }}>
                <CollapsibleMonth
                  colors={colors}
                  anchor={cursor}
                  selected={selected}
                  today={today}
                  byDay={byDay}
                  expanded={expanded}
                  onExpandedChange={setCalendarExpanded}
                  onSelectDay={selectDay}
                  onSwipeMonth={shiftMonth}
                />
              </Animated.View>

              <View style={[styles.dayBanner, { borderBottomColor: colors.border, paddingHorizontal: screenPad }]}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600", flex: 1 }}>
                  {sameDay(selected, today) ? "Today" : formatDayHeading(selected)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {dayTasks.filter((t) => !t.done).length} open
                </Text>
                <Pressable onPress={() => openCreate(selected)} hitSlop={8} style={{ marginLeft: 12 }}>
                  <Feather name="plus" size={20} color={colors.accent} />
                </Pressable>
              </View>

              <FlatList
                data={dayTasks}
                keyExtractor={(t) => t.id}
                contentContainerStyle={{
                  paddingHorizontal: screenPad,
                  paddingTop: 8,
                  paddingBottom: listBottomClearance(false) + 24,
                  flexGrow: 1,
                }}
                onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
                scrollEventThrottle={16}
                ListEmptyComponent={
                  <Pressable onPress={() => openCreate(selected)} style={styles.emptyDay}>
                    <EmptyState
                      compact
                      icon="sunrise"
                      title="A clean slate"
                      subtitle="Nothing due this day — tap to add a task."
                    />
                  </Pressable>
                }
                renderItem={({ item }) => (
                  <TaskRow
                    task={item}
                    colors={colors}
                    onPress={() => openEdit(item)}
                    onToggle={() => {
                      update.mutate({ id: item.id, patch: { done: !item.done } });
                    }}
                    onReschedule={(dir) => {
                      if (!item.dueAt) return;
                      const next = addDays(item.due, dir);
                      update.mutate({
                        id: item.id,
                        patch: { dueAt: moveDueToDate(item.dueAt, next) },
                      });
                      selectDay(next);
                    }}
                  />
                )}
              />
            </>
          )}

          {view === "week" && (
            <FlatList
              data={weekStrip}
              keyExtractor={(d) => dayKey(d)}
              contentContainerStyle={{ paddingHorizontal: screenPad, paddingBottom: listBottomClearance(false) + 24 }}
              renderItem={({ item: day }) => {
                const list = tasksOnDay(byDay, day);
                const isSel = sameDay(day, selected);
                const isToday = sameDay(day, today);
                return (
                  <Pressable
                    onPress={() => selectDay(day)}
                    style={[
                      styles.weekBlock,
                      {
                        borderColor: isSel ? colors.accent : colors.border,
                        backgroundColor: isSel ? colors.accentSoft : colors.surface1,
                      },
                    ]}
                  >
                    <View style={styles.weekBlockHead}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {day.toLocaleDateString(undefined, { weekday: "short" })}
                      </Text>
                      <View
                        style={[
                          styles.miniBubble,
                          isToday && { backgroundColor: colors.accent },
                        ]}
                      >
                        <Text
                          style={{
                            color: isToday ? colors.surface0 : colors.textPrimary,
                            fontWeight: "600",
                            fontSize: 14,
                          }}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                      <Pressable onPress={() => openCreate(day)} hitSlop={6}>
                        <Feather name="plus" size={16} color={colors.accent} />
                      </Pressable>
                    </View>
                    {list.length === 0 ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 12, paddingVertical: 6 }}>—</Text>
                    ) : (
                      list.map((t) => (
                        <Pressable key={t.id} onPress={() => openEdit(t)} style={styles.weekChip}>
                          <View style={[styles.chipDot, { backgroundColor: t.done ? colors.border : colors.accent }]} />
                          <Text
                            numberOfLines={1}
                            style={{
                              color: colors.textPrimary,
                              fontSize: 13,
                              flex: 1,
                              textDecorationLine: t.done ? "line-through" : "none",
                              opacity: t.done ? 0.5 : 1,
                            }}
                          >
                            {t.title}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          {view === "day" && (
            <FlatList
              data={dayTasks}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{
                paddingHorizontal: screenPad,
                paddingTop: 12,
                paddingBottom: listBottomClearance(false) + 24,
                flexGrow: 1,
              }}
              ListHeaderComponent={
                <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "600", flex: 1 }}>
                    {formatDayHeading(selected)}
                  </Text>
                  <Pressable onPress={() => openCreate(selected)} hitSlop={8}>
                    <Feather name="plus-circle" size={22} color={colors.accent} />
                  </Pressable>
                </View>
              }
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Nothing scheduled.</Text>
              }
              renderItem={({ item }) => (
                <TaskRow
                  task={item}
                  colors={colors}
                  onPress={() => openEdit(item)}
                  onToggle={() => update.mutate({ id: item.id, patch: { done: !item.done } })}
                />
              )}
            />
          )}

          {view === "agenda" && (
            <FlatList
              data={agendaKeys}
              keyExtractor={(k) => k}
              contentContainerStyle={{
                paddingHorizontal: screenPad,
                paddingTop: 8,
                paddingBottom: listBottomClearance(false) + 24,
              }}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 24, textAlign: "center" }}>
                  No dated tasks yet.
                </Text>
              }
              renderItem={({ item: key }) => {
                const [y, m, d] = key.split("-").map(Number);
                const day = new Date(y, m - 1, d);
                const list = byDay.get(key) ?? [];
                const isToday = sameDay(day, today);
                return (
                  <View style={{ marginBottom: 16 }}>
                    <Pressable
                      onPress={() => {
                        selectDay(day);
                        setView("schedule");
                        setExpanded(false);
                      }}
                      style={styles.agendaHead}
                    >
                      <Text style={{ color: isToday ? colors.accent : colors.textPrimary, fontWeight: "600", fontSize: 13 }}>
                        {isToday ? "Today · " : ""}
                        {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{list.length}</Text>
                    </Pressable>
                    {list.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        colors={colors}
                        onPress={() => openEdit(t)}
                        onToggle={() => update.mutate({ id: t.id, patch: { done: !t.done } })}
                      />
                    ))}
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {/* View picker */}
      <Modal visible={viewMenu} transparent animationType="fade" onRequestClose={() => setViewMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setViewMenu(false)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, marginBottom: 8 }}>
              VIEW
            </Text>
            {VIEW_OPTIONS.map((opt) => {
              const active = view === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    setView(opt.id);
                    setViewMenu(false);
                    if (opt.id === "schedule") setCalendarExpanded(false);
                  }}
                  style={[styles.menuRow, active && { backgroundColor: colors.accentSoft }]}
                >
                  <Feather name={opt.icon} size={16} color={active ? colors.accent : colors.textSecondary} />
                  <Text style={{ color: active ? colors.accent : colors.textPrimary, fontSize: 15, flex: 1, fontWeight: active ? "600" : "400" }}>
                    {opt.label}
                  </Text>
                  {active && <Feather name="check" size={16} color={colors.accent} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <TaskFormModal
        visible={draft !== null}
        title="New task"
        submitLabel={create.isPending ? "Adding…" : "Add task"}
        draft={draft}
        busy={create.isPending}
        autoFocus
        onClose={() => setDraft(null)}
        onChange={setDraft}
        onSubmit={() => {
          if (!draft?.title.trim() || create.isPending) return;
          create.mutate({
            title: draft.title.trim(),
            description: draft.description.trim() || undefined,
            dueAt: draft.due ? draft.due.toISOString() : undefined,
            repeatRule: draft.due ? draft.repeat : null,
          });
        }}
      />

      <TaskFormModal
        visible={editing !== null}
        title="Edit task"
        submitLabel={update.isPending ? "Saving…" : "Save"}
        draft={editing}
        busy={update.isPending}
        onClose={() => setEditing(null)}
        onChange={(next) => next && setEditing({ ...editing!, ...next })}
        onSubmit={() => {
          if (!editing?.title.trim() || update.isPending) return;
          update.mutate({
            id: editing.id,
            patch: {
              title: editing.title.trim(),
              description: editing.description.trim(),
              dueAt: editing.due ? editing.due.toISOString() : null,
              repeatRule: editing.due ? editing.repeat : null,
            },
          });
        }}
      />
    </KeyboardSafe>
  );
}

function TaskRow({
  task,
  colors,
  onPress,
  onToggle,
  onReschedule,
}: {
  task: CalendarTask;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
  onToggle: () => void;
  onReschedule?: (dir: -1 | 1) => void;
}) {
  const time = formatTime(task.due);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => onReschedule?.(1)}
      style={[styles.taskRow, { backgroundColor: colors.surface1, borderColor: colors.border }]}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={[
          styles.check,
          {
            borderColor: task.done ? colors.accent : colors.textSecondary,
            backgroundColor: task.done ? colors.accent : "transparent",
          },
        ]}
      >
        {task.done && <Feather name="check" size={12} color={colors.surface0} />}
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textPrimary,
            fontSize: 15,
            textDecorationLine: task.done ? "line-through" : "none",
            opacity: task.done ? 0.55 : 1,
          }}
        >
          {task.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
          {!!time && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{time}</Text>}
          {!!task.repeatRule && (
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {formatRepeatLabel(task.repeatRule)}
            </Text>
          )}
        </View>
      </View>
      {task.starred && <Feather name="star" size={14} color={colors.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 4,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  navBtn: { padding: 6, width: 36, alignItems: "center" },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: 2,
  },
  dayBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyDay: { paddingVertical: 48, alignItems: "center" },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  weekBlock: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
  },
  weekBlockHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  miniBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  weekChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  agendaHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    padding: 16,
    paddingBottom: 40,
  },
  menuCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
});
