import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Task } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useFocusColors } from "../contexts/focusColors";
import {
  FOCUS_MATRIX,
  FOCUS_META,
  normalizeFocus,
  sortByFocusPriority,
  type TaskFocus,
} from "../lib/taskFocus";
import { formatDueLabel } from "./GlassDateTimePicker";

/** "all" shows every focus as stacked sections; otherwise one focus list. */
type FocusFilter = "all" | TaskFocus;

function CompactCard({
  task,
  colors,
  tint,
  onPress,
  onToggle,
  onReclass,
}: {
  task: Task;
  colors: ThemeColors;
  tint: string | null;
  onPress: () => void;
  onToggle: () => void;
  onReclass: () => void;
}) {
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
          {!!task.dueAt && (
            <Text
              style={{ color: tint || colors.textSecondary, fontSize: 10, fontWeight: "600" }}
              numberOfLines={1}
            >
              {formatDueLabel(task.dueAt)}
            </Text>
          )}
          {(task.subtasks?.length ?? 0) > 0 && (
            <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "700" }}>
              {task.subtasks!.filter((s) => s.done).length}/{task.subtasks!.length} sub
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function SectionHead({
  focus,
  count,
  colors,
  tint,
}: {
  focus: TaskFocus;
  count: number;
  colors: ThemeColors;
  tint: string | null;
}) {
  const label = focus === "none" ? "Unsorted" : FOCUS_META[focus].label;
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.dot, { backgroundColor: tint || colors.textSecondary }]} />
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{count}</Text>
    </View>
  );
}

function TaskList({
  list,
  colors,
  colorFor,
  onToggle,
  onEdit,
  onReclass,
  emptyLabel,
}: {
  list: Task[];
  colors: ThemeColors;
  colorFor: (f: TaskFocus) => string | null;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onReclass: (t: Task) => void;
  emptyLabel: string;
}) {
  if (list.length === 0) {
    return (
      <Text style={{ color: colors.textSecondary, fontSize: 13, paddingVertical: 10 }}>{emptyLabel}</Text>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {list.map((t) => (
        <CompactCard
          key={t.id}
          task={t}
          colors={colors}
          tint={colorFor(normalizeFocus(t.focus))}
          onPress={() => onEdit(t)}
          onToggle={() => onToggle(t)}
          onReclass={() => onReclass(t)}
        />
      ))}
    </View>
  );
}

/**
 * Single mobile Focus view (Matrix + Board merged).
 * Chips filter one focus; All stacks sections. Long-press a card to reclassify.
 */
export function FocusBoardMobile({
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
  const { colorFor, washFor } = useFocusColors();
  const open = sortByFocusPriority(tasks.filter((t) => !t.done));
  const countFor = (f: TaskFocus) => open.filter((t) => normalizeFocus(t.focus) === f).length;
  const hasUnsorted = countFor("none") > 0;

  const chipIds: FocusFilter[] = hasUnsorted
    ? ["all", ...FOCUS_MATRIX, "none"]
    : ["all", ...FOCUS_MATRIX];

  const [filter, setFilter] = useState<FocusFilter>("all");
  const active: FocusFilter = chipIds.includes(filter) ? filter : "all";

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.chipRow}>
        {chipIds.map((id) => {
          const selected = id === active;
          const c = id === "all" ? colors.accent : colorFor(id);
          const label =
            id === "all" ? "All" : id === "none" ? "Clear" : FOCUS_META[id].label;
          const n = id === "all" ? open.length : countFor(id);
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? c || colors.accent : colors.border,
                  backgroundColor:
                    selected && id !== "all"
                      ? washFor(id)
                      : selected
                        ? colors.accentSoft
                        : colors.surface1,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? c || colors.accent : colors.textSecondary,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {label}
              </Text>
              <Text
                style={{
                  color: selected ? c || colors.accent : colors.textSecondary,
                  fontSize: 11,
                  fontWeight: "600",
                  opacity: 0.85,
                }}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {active === "all" ? (
        <View style={{ gap: 10 }}>
          {(["critical", "steady", "swift", "quiet", "none"] as TaskFocus[]).map((id) => {
            const list = open.filter((t) => normalizeFocus(t.focus) === id);
            if (list.length === 0) return null;
            const accent = colorFor(id);
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
                <SectionHead focus={id} count={list.length} colors={colors} tint={accent} />
                <View style={{ paddingTop: 6 }}>
                  <TaskList
                    list={list}
                    colors={colors}
                    colorFor={colorFor}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onReclass={onReclass}
                    emptyLabel="Nothing here"
                  />
                </View>
              </View>
            );
          })}
          {open.length === 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: 16 }}>
              No open tasks
            </Text>
          )}
        </View>
      ) : (
        <View
          style={[
            styles.focusList,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface1,
              borderLeftColor: colorFor(active) || colors.border,
            },
          ]}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 8 }}>
            {active === "none" ? "No focus yet" : FOCUS_META[active].hint}
          </Text>
          <TaskList
            list={open.filter((t) => normalizeFocus(t.focus) === active)}
            colors={colors}
            colorFor={colorFor}
            onToggle={onToggle}
            onEdit={onEdit}
            onReclass={onReclass}
            emptyLabel="Nothing in this focus"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  focusList: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 10,
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
