import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Task } from "../lib/types";
import type { ThemeColors } from "../theme";
import {
  FOCUS_MATRIX,
  FOCUS_META,
  focusColor,
  focusWash,
  normalizeFocus,
  sortByFocusPriority,
  type TaskFocus,
} from "../lib/taskFocus";
import { formatDueLabel } from "./GlassDateTimePicker";

function CompactCard({
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
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onReclass}
      delayLongPress={280}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface0 }]}
    >
      <Pressable onPress={onToggle} hitSlop={8}>
        <Feather
          name={task.done ? "check-square" : "square"}
          size={15}
          color={task.done ? colors.accent : colors.textSecondary}
        />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: task.done ? colors.textSecondary : colors.textPrimary,
            fontSize: 13,
            fontWeight: "600",
            lineHeight: 17,
            textDecorationLine: task.done ? "line-through" : "none",
          }}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        {!!task.dueAt && (
          <Text
            style={{ color: accent || colors.textSecondary, fontSize: 10, marginTop: 2, fontWeight: "600" }}
            numberOfLines={1}
          >
            {formatDueLabel(task.dueAt)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function QuadHeader({
  focus,
  count,
  colors,
}: {
  focus: TaskFocus;
  count: number;
  colors: ThemeColors;
}) {
  const c = focusColor(focus, {
    accent: colors.accent,
    danger: colors.danger,
    textSecondary: colors.textSecondary,
    warn: colors.warn,
  });
  return (
    <View style={styles.quadHead}>
      <View style={[styles.dot, { backgroundColor: c || colors.textSecondary }]} />
      <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", flex: 1 }} numberOfLines={1}>
        {FOCUS_META[focus].label}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600" }}>{count}</Text>
    </View>
  );
}

function SectionHead({
  focus,
  count,
  colors,
}: {
  focus: TaskFocus;
  count: number;
  colors: ThemeColors;
}) {
  const c = focusColor(focus, {
    accent: colors.accent,
    danger: colors.danger,
    textSecondary: colors.textSecondary,
    warn: colors.warn,
  });
  const label = focus === "none" ? "Unsorted" : FOCUS_META[focus].label;
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.dot, { backgroundColor: c || colors.textSecondary }]} />
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{count}</Text>
    </View>
  );
}

/** Mobile Eisenhower — quiet 2×2; long-press a card to reclassify. */
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
  const unsorted = by("none");

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.matrixShell, { borderColor: colors.border, backgroundColor: colors.surface1 }]}>
        {FOCUS_MATRIX.map((id, i) => {
          const list = by(id);
          const right = i % 2 === 1;
          const bottom = i < 2;
          return (
            <View
              key={id}
              style={[
                styles.quad,
                {
                  borderColor: colors.border,
                  borderRightWidth: right ? 0 : StyleSheet.hairlineWidth,
                  borderBottomWidth: bottom ? StyleSheet.hairlineWidth : 0,
                  backgroundColor: focusWash(id, colors.accent),
                },
              ]}
            >
              <QuadHeader focus={id} count={list.length} colors={colors} />
              <ScrollView style={{ maxHeight: 148 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <View style={{ paddingHorizontal: 8, paddingBottom: 8, gap: 5 }}>
                  {list.length === 0 ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 11, paddingVertical: 6 }}>—</Text>
                  ) : (
                    list.map((t) => (
                      <CompactCard
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
            </View>
          );
        })}
      </View>

      {unsorted.length > 0 && (
        <View style={[styles.unsorted, { borderColor: colors.border }]}>
          <SectionHead focus="none" count={unsorted.length} colors={colors} />
          <View style={{ gap: 5, paddingTop: 6 }}>
            {unsorted.map((t) => (
              <CompactCard
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

/**
 * Mobile board workaround: stacked focus sections (not a horizontal kanban).
 * Same actions — tap edit, check toggle, long-press reclassify — with less visual weight.
 */
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
  const open = sortByFocusPriority(tasks.filter((t) => !t.done));
  const columns: TaskFocus[] = ["critical", "steady", "swift", "quiet", "none"];

  return (
    <View style={{ gap: 10 }}>
      {columns.map((id) => {
        const list = open.filter((t) => normalizeFocus(t.focus) === id);
        if (list.length === 0 && id === "none") return null;
        const accent = focusColor(id, {
          accent: colors.accent,
          danger: colors.danger,
          textSecondary: colors.textSecondary,
          warn: colors.warn,
        });
        return (
          <View
            key={id}
            style={[
              styles.stackSection,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface1,
                borderLeftColor: accent || colors.border,
              },
            ]}
          >
            <SectionHead focus={id} count={list.length} colors={colors} />
            {list.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 11, paddingTop: 4 }}>Nothing here</Text>
            ) : (
              <View style={{ gap: 5, paddingTop: 6 }}>
                {list.map((t) => (
                  <CompactCard
                    key={t.id}
                    task={t}
                    colors={colors}
                    onPress={() => onEdit(t)}
                    onToggle={() => onToggle(t)}
                    onReclass={() => onReclass(t)}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  matrixShell: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    overflow: "hidden",
  },
  quad: {
    width: "50%",
    minHeight: 96,
  },
  quadHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  stackSection: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  unsorted: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 999 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
