import { useWindowDimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Task } from "../lib/types";
import type { ThemeColors } from "../theme";
import {
  FOCUS_MATRIX,
  FOCUS_META,
  focusBorder,
  focusColor,
  focusWash,
  normalizeFocus,
  sortByFocusPriority,
  type TaskFocus,
} from "../lib/taskFocus";
import { formatDueLabel } from "./GlassDateTimePicker";

function BoardCard({
  task,
  colors,
  onPress,
  onToggle,
  onReclass,
}: {
  task: Task;
  colors: ThemeColors;
  onPress: () => void;
  onToggle: () => void;
  onReclass: () => void;
}) {
  const focus = normalizeFocus(task.focus);
  const accent = focusColor(focus, {
    accent: colors.accent,
    danger: colors.danger,
    textSecondary: colors.textSecondary,
    warn: colors.warn,
  });
  const wash = focusWash(focus, colors.accent);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onReclass}
      delayLongPress={280}
      style={[
        styles.card,
        {
          backgroundColor: wash,
          borderColor: focusBorder(focus, colors.accent, colors.border),
          borderLeftColor: accent || colors.border,
          borderLeftWidth: 3,
        },
      ]}
    >
      <Pressable onPress={onToggle} hitSlop={8} style={{ paddingTop: 1 }}>
        <Feather
          name={task.done ? "check-square" : "square"}
          size={16}
          color={task.done ? colors.accent : colors.textSecondary}
        />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 2 }}>
        <Text
          style={{
            color: task.done ? colors.textSecondary : colors.textPrimary,
            fontSize: 13,
            fontWeight: "600",
            textDecorationLine: task.done ? "line-through" : "none",
          }}
          numberOfLines={3}
        >
          {task.title}
        </Text>
        {!!task.dueAt && (
          <Text
            style={{
              color: accent || colors.textSecondary,
              fontSize: 11,
              marginTop: 3,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {formatDueLabel(task.dueAt)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function ColumnHeader({
  focus,
  count,
  colors,
}: {
  focus: TaskFocus;
  count: number;
  colors: ThemeColors;
}) {
  const meta = FOCUS_META[focus];
  const c = focusColor(focus, {
    accent: colors.accent,
    danger: colors.danger,
    textSecondary: colors.textSecondary,
    warn: colors.warn,
  });
  return (
    <View
      style={[
        styles.colHead,
        {
          borderBottomColor: colors.border,
          backgroundColor: focusWash(focus, colors.accent),
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
        <View style={[styles.dot, { backgroundColor: c || colors.textSecondary }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: c || colors.textPrimary, fontSize: 14, fontWeight: "700", paddingRight: 4 }}
            numberOfLines={1}
          >
            {meta.label}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }} numberOfLines={2}>
            {meta.hint}
          </Text>
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: c ? `${c}22` : colors.surface2 }]}>
        <Text style={{ color: c || colors.textSecondary, fontSize: 11, fontWeight: "700" }}>{count}</Text>
      </View>
    </View>
  );
}

function PaneShell({
  focus,
  colors,
  children,
  style,
}: {
  focus: TaskFocus;
  colors: ThemeColors;
  children: React.ReactNode;
  style?: object;
}) {
  const c = focusColor(focus, {
    accent: colors.accent,
    danger: colors.danger,
    textSecondary: colors.textSecondary,
    warn: colors.warn,
  });
  return (
    <View
      style={[
        styles.pane,
        {
          backgroundColor: colors.surface1,
          borderColor: focusBorder(focus, colors.accent, colors.border),
          shadowColor: c || "#000",
          shadowOpacity: 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Mobile Eisenhower — 2×2 glass panes; long-press a card to reclassify. */
export function EisenhowerBoardMobile({
  tasks,
  colors,
  onToggle,
  onEdit,
  onReclass,
}: {
  tasks: Task[];
  colors: ThemeColors;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onReclass: (t: Task) => void;
}) {
  const open = sortByFocusPriority(tasks.filter((t) => !t.done));
  const by = (f: TaskFocus) => open.filter((t) => normalizeFocus(t.focus) === f);

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: "center", fontWeight: "500" }}>
        Long-press a task to move between quadrants
      </Text>
      <View style={styles.matrix}>
        {FOCUS_MATRIX.map((id) => {
          const list = by(id);
          return (
            <PaneShell key={id} focus={id} colors={colors} style={styles.quad}>
              <ColumnHeader focus={id} count={list.length} colors={colors} />
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                <View style={{ padding: 8, gap: 7 }}>
                  {list.length === 0 ? (
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 11,
                        textAlign: "center",
                        paddingVertical: 16,
                      }}
                    >
                      Empty
                    </Text>
                  ) : (
                    list.map((t) => (
                      <BoardCard
                        key={t.id}
                        task={t}
                        colors={colors}
                        onPress={() => onEdit(t)}
                        onToggle={() => onToggle(t)}
                        onReclass={() => onReclass(t)}
                      />
                    ))
                  )}
                </View>
              </ScrollView>
            </PaneShell>
          );
        })}
      </View>
      {by("none").length > 0 && (
        <View style={[styles.unsorted, { borderColor: colors.border, backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginBottom: 8 }}>
            Unsorted · {by("none").length}
          </Text>
          <View style={{ gap: 7 }}>
            {by("none").map((t) => (
              <BoardCard
                key={t.id}
                task={t}
                colors={colors}
                onPress={() => onEdit(t)}
                onToggle={() => onToggle(t)}
                onReclass={() => onReclass(t)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** Mobile Kanban — wider columns that use the screen. */
export function KanbanBoardMobile({
  tasks,
  colors,
  onToggle,
  onEdit,
  onReclass,
}: {
  tasks: Task[];
  colors: ThemeColors;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onReclass: (t: Task) => void;
}) {
  const { width } = useWindowDimensions();
  const open = sortByFocusPriority(tasks.filter((t) => !t.done));
  const columns: TaskFocus[] = ["critical", "steady", "swift", "quiet", "none"];
  // Fill most of the screen; peek next column slightly
  const colW = Math.min(300, Math.max(220, Math.round(width * 0.78)));

  return (
    <View>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 11,
          textAlign: "center",
          marginBottom: 10,
          fontWeight: "500",
        }}
      >
        Swipe columns · long-press to reclassify
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={colW + 12}
        contentContainerStyle={{ gap: 12, paddingBottom: 8, paddingHorizontal: 2 }}
      >
        {columns.map((id) => {
          const list = open.filter((t) => normalizeFocus(t.focus) === id);
          return (
            <PaneShell key={id} focus={id} colors={colors} style={{ width: colW }}>
              <ColumnHeader focus={id} count={list.length} colors={colors} />
              <ScrollView style={{ maxHeight: Math.round(width > 400 ? 520 : 460) }} nestedScrollEnabled>
                <View style={{ padding: 8, gap: 7 }}>
                  {list.length === 0 ? (
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 11,
                        textAlign: "center",
                        paddingVertical: 20,
                      }}
                    >
                      Empty
                    </Text>
                  ) : (
                    list.map((t) => (
                      <BoardCard
                        key={t.id}
                        task={t}
                        colors={colors}
                        onPress={() => onEdit(t)}
                        onToggle={() => onToggle(t)}
                        onReclass={() => onReclass(t)}
                      />
                    ))
                  )}
                </View>
              </ScrollView>
            </PaneShell>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  matrix: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pane: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  quad: {
    width: "48%",
    flexGrow: 1,
    minWidth: "46%",
  },
  colHead: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 999 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  unsorted: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    padding: 12,
  },
});
