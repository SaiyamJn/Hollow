import { useEffect, useMemo, useRef, useState } from "react";
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
import { TaskFormModal, formatRepeatLabel, repeatPayload, type TaskDraft } from "../components/TaskFormModal";
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
import { datedTasks, expandForRange, groupByDay, tasksOnDay, type CalendarTask } from "./taskIndex";
import { CollapsibleMonth, ensureSelectedInMonth } from "./CollapsibleMonth";
import EmptyState from "../components/EmptyState";
import { animatePanel } from "../lib/motion";
import { normalizeFocus, sortByFocusPriority } from "../lib/taskFocus";
import { useFocusColors } from "../contexts/focusColors";

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
  const { colorFor } = useFocusColors();
  const queryClient = useQueryClient();
  const { screenPad, listBottomClearance } = useLayout();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = useMemo(() => startOfDay(new Date(nowMs)), [nowMs]);
  const [view, setView] = useState<CalView>("schedule");
  const [viewMenu, setViewMenu] = useState(false);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);

  const scrollY = useRef(0);
  const listDragging = useRef(false);
  const pullStartY = useRef<number | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const dated = useMemo(() => datedTasks(tasks), [tasks]);
  // Wide window so month indicators + agenda cover far-out repeats.
  const rangeStart = useMemo(() => addDays(startOfMonth(cursor), -40), [cursor]);
  const rangeEnd = useMemo(() => addDays(startOfMonth(addMonths(cursor, 12)), -1), [cursor]);
  const expandedTasks = useMemo(
    () => expandForRange(dated, rangeStart, rangeEnd),
    [dated, rangeStart, rangeEnd]
  );
  const byDay = useMemo(() => groupByDay(expandedTasks), [expandedTasks]);
  const dayTasks = useMemo(
    () => sortByFocusPriority(tasksOnDay(byDay, selected)),
    [byDay, selected]
  );

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
        focus?: Task["focus"];
        repeatRule?: Task["repeatRule"];
        repeatDays?: number[] | null;
        repeatInterval?: number | null;
        repeatEnd?: Task["repeatEnd"];
        repeatUntil?: string | null;
        repeatCount?: number | null;
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
    setDraft({
      title: "",
      description: "",
      due: dateOnlyDue(day),
      focus: "none",
      repeat: null,
      repeatDays: null,
      repeatInterval: 1,
      repeatEnd: null,
      repeatUntil: null,
      repeatCount: null,
    });
  }

  function toggleTask(t: CalendarTask) {
    if (t.virtual) return;
    update.mutate({ id: t.id, patch: { done: !t.done } });
  }

  function openEdit(task: CalendarTask) {
    // Series anchor dueAt — never rewrite schedule from a virtual occurrence day.
    const seriesDue = task.dueAt ? new Date(task.dueAt) : task.due;
    setEditing({
      id: task.sourceId ?? task.id,
      title: task.title,
      description: task.description ?? "",
      due: seriesDue,
      focus: task.focus ?? "none",
      repeat: task.repeatRule,
      repeatDays: task.repeatDays ?? null,
      repeatInterval: task.repeatInterval ?? 1,
      repeatEnd: task.repeatEnd ?? null,
      repeatUntil: task.repeatUntil ? new Date(task.repeatUntil) : null,
      repeatCount: task.repeatCount ?? null,
    });
  }

  function onListScroll(y: number) {
    const prev = scrollY.current;
    scrollY.current = y;
    if (view !== "schedule") return;
    // Only collapse from a real drag — FlatList content swaps on day change
    // can emit scroll events and would otherwise yank the month closed.
    if (!listDragging.current) return;
    if (y > 24 && y > prev && expanded) setCalendarExpanded(false);
  }

  /** At list top: swipe down expands month; swipe up collapses to week strip. */
  function onListTouchStart(pageY: number) {
    if (view !== "schedule" || scrollY.current > 4) {
      pullStartY.current = null;
      return;
    }
    pullStartY.current = pageY;
  }

  function onListTouchMove(pageY: number) {
    if (pullStartY.current == null || view !== "schedule") return;
    if (scrollY.current > 4) {
      pullStartY.current = null;
      return;
    }
    const dy = pageY - pullStartY.current;
    if (!expanded && dy > 40) {
      pullStartY.current = null;
      setCalendarExpanded(true);
      void Haptics.selectionAsync();
    } else if (expanded && dy < -40) {
      pullStartY.current = null;
      setCalendarExpanded(false);
      void Haptics.selectionAsync();
    }
  }

  function onListTouchEnd() {
    pullStartY.current = null;
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
            <Pressable
              onPress={() => {
                if (view === "schedule") shiftMonth(-1);
                else if (view === "week") selectDay(addDays(selected, -7));
                else selectDay(addDays(selected, -1));
              }}
              hitSlop={10}
              style={styles.navBtn}
            >
              <Feather name="chevron-left" size={22} color={colors.textPrimary} />
            </Pressable>
          )}
          <Pressable onPress={jumpToday} style={{ flex: 1 }} hitSlop={6}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "600", textAlign: "center" }} numberOfLines={1}>
              {headerTitle}
            </Text>
          </Pressable>
          {view !== "agenda" && (
            <Pressable
              onPress={() => {
                if (view === "schedule") shiftMonth(1);
                else if (view === "week") selectDay(addDays(selected, 7));
                else selectDay(addDays(selected, 1));
              }}
              hitSlop={10}
              style={styles.navBtn}
            >
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
                  onCreateDay={openCreate}
                  onSwipeMonth={shiftMonth}
                />
              </Animated.View>

              <Pressable
                onPress={() => openCreate(selected)}
                style={[styles.dayBanner, { borderBottomColor: colors.border, paddingHorizontal: screenPad }]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600", flex: 1, paddingRight: 8 }}>
                  {sameDay(selected, today) ? "Today" : formatDayHeading(selected)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginRight: 4 }}>
                  {dayTasks.filter((t) => !t.done).length} open
                </Text>
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>Add</Text>
              </Pressable>

              <FlatList
                data={dayTasks}
                keyExtractor={(t) => t.id}
                contentContainerStyle={{
                  paddingHorizontal: screenPad,
                  paddingTop: 8,
                  paddingBottom: listBottomClearance(false) + 24,
                  flexGrow: 1,
                }}
                onScroll={(e) => {
                  const y = e.nativeEvent.contentOffset.y;
                  onListScroll(y);
                  if (!listDragging.current) return;
                  // iOS rubber-band: pull down expands, bounce-up collapses
                  if (!expanded && y < -24) {
                    pullStartY.current = null;
                    setCalendarExpanded(true);
                    void Haptics.selectionAsync();
                  }
                }}
                onScrollBeginDrag={() => {
                  listDragging.current = true;
                }}
                onScrollEndDrag={() => {
                  listDragging.current = false;
                }}
                onMomentumScrollEnd={() => {
                  listDragging.current = false;
                }}
                onTouchStart={(e) => onListTouchStart(e.nativeEvent.pageY)}
                onTouchMove={(e) => onListTouchMove(e.nativeEvent.pageY)}
                onTouchEnd={onListTouchEnd}
                onTouchCancel={onListTouchEnd}
                scrollEventThrottle={16}
                bounces
                overScrollMode="always"
                ListEmptyComponent={
                  <View style={styles.emptyDay}>
                    <EmptyState
                      compact
                      icon="sunrise"
                      title="Nothing planned"
                      subtitle={
                        expanded
                          ? "Swipe up for the week view · tap to add something."
                          : "Swipe down for the full month · tap to add something."
                      }
                    />
                    <Pressable onPress={() => openCreate(selected)} hitSlop={12} style={{ marginTop: 8, alignSelf: "center" }}>
                      <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>Add something</Text>
                    </Pressable>
                  </View>
                }
                renderItem={({ item }) => (
                  <TaskRow
                    task={item}
                    colors={colors}
                    onPress={() => openEdit(item)}
                    onToggle={() => toggleTask(item)}
                    onReschedule={(dir) => {
                      if (item.virtual || !item.dueAt) return;
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
                const list = sortByFocusPriority(tasksOnDay(byDay, day));
                const isSel = sameDay(day, selected);
                const isToday = sameDay(day, today);
                const isPast = day < today;
                return (
                  <Pressable
                    onPress={() => selectDay(day)}
                    onLongPress={() => openCreate(day)}
                    delayLongPress={320}
                    style={[
                      styles.weekBlock,
                      {
                        borderColor: isSel ? colors.accent : colors.glassBorder,
                        backgroundColor: isSel ? colors.accentSoft : colors.glass,
                        opacity: isPast && !isSel ? 0.55 : 1,
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
                    </View>
                    {list.length === 0 ? (
                      <Pressable onPress={() => openCreate(day)}>
                        <Text style={{ color: colors.accent, fontSize: 12, paddingVertical: 6, fontWeight: "600" }}>
                          Add task
                        </Text>
                      </Pressable>
                    ) : (
                      list.map((t) => {
                        const focus = normalizeFocus(t.focus);
                        const tint = colorFor(focus) || colors.accent;
                        return (
                          <Pressable key={t.id} onPress={() => openEdit(t)} style={styles.weekChip}>
                            <View
                              style={[
                                styles.chipDot,
                                { backgroundColor: t.done ? colors.border : tint },
                              ]}
                            />
                            <Text
                              numberOfLines={1}
                              style={{
                                color: colors.textPrimary,
                                fontSize: 13,
                                flex: 1,
                                paddingRight: 4,
                                textDecorationLine: t.done ? "line-through" : "none",
                                opacity: t.done ? 0.5 : 1,
                              }}
                            >
                              {t.title}
                            </Text>
                          </Pressable>
                        );
                      })
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
                <Pressable
                  onPress={() => openCreate(selected)}
                  style={{ marginBottom: 12, flexDirection: "row", alignItems: "center" }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "600", flex: 1, paddingRight: 8 }}>
                    {formatDayHeading(selected)}
                  </Text>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>Add</Text>
                </Pressable>
              }
              ListEmptyComponent={
                <Pressable onPress={() => openCreate(selected)}>
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
                    Nothing scheduled — tap to add
                  </Text>
                </Pressable>
              }
              renderItem={({ item }) => (
                <TaskRow
                  task={item}
                  colors={colors}
                  onPress={() => openEdit(item)}
                  onToggle={() => toggleTask(item)}
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
                  No dated tasks yet — give something a day and it'll show up here.
                </Text>
              }
              renderItem={({ item: key }) => {
                const [y, m, d] = key.split("-").map(Number);
                const day = new Date(y, m - 1, d);
                const list = sortByFocusPriority(byDay.get(key) ?? []);
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
                        onToggle={() => toggleTask(t)}
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
            focus: draft.focus ?? "none",
            ...repeatPayload(draft),
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
              focus: editing.focus ?? "none",
              ...repeatPayload(editing),
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
  const focus = normalizeFocus(task.focus);
  const { colorFor, washFor } = useFocusColors();
  const tint = colorFor(focus) || colors.border;
  const wash = washFor(focus);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => onReschedule?.(1)}
      style={[
        styles.taskRow,
        {
          backgroundColor: wash !== "transparent" ? wash : colors.glass,
          borderColor: colors.glassBorder,
          borderLeftWidth: 3,
          borderLeftColor: tint,
        },
      ]}
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
      <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textPrimary,
            fontSize: 15,
            fontWeight: "500",
            textDecorationLine: task.done ? "line-through" : "none",
            opacity: task.done ? 0.55 : 1,
          }}
        >
          {task.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
          {!!time && (
            <Text style={{ color: tint, fontSize: 12, fontWeight: "600" }}>{time}</Text>
          )}
          {!!task.repeatRule && (
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
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
