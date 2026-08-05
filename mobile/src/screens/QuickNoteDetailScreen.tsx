import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { deleteQuickNote, fetchQuickNotes, updateQuickNote } from "../lib/api";
import { useTheme } from "../contexts/theme";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useLayout } from "../lib/layout";

const PALETTE: Record<string, string> = {
  gray: "transparent",
  yellow: "rgba(234, 179, 8, 0.14)",
  green: "rgba(93, 202, 165, 0.14)",
  blue: "rgba(96, 165, 250, 0.14)",
  red: "rgba(248, 113, 113, 0.14)",
  purple: "rgba(192, 132, 252, 0.14)",
};

const DOT_COLORS: Record<string, string> = {
  gray: "#8a8d93",
  yellow: "rgb(234, 179, 8)",
  green: "rgb(93, 202, 165)",
  blue: "rgb(96, 165, 250)",
  red: "rgb(248, 113, 113)",
  purple: "rgb(192, 132, 252)",
};

/** Full-screen quick note editor — back returns to the notes list. */
export default function QuickNoteDetailScreen({ route, navigation }: any) {
  const { noteId, content: initialContent, color: initialColor } = route.params as {
    noteId: string;
    content?: string;
    color?: string;
  };
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const { data: notes } = useQuery({
    queryKey: ["quicknotes", "all"],
    queryFn: () => fetchQuickNotes(true),
  });
  const note = notes?.find((n) => n.id === noteId);

  const [content, setContent] = useState(initialContent ?? note?.content ?? "");
  const [color, setColor] = useState(initialColor ?? note?.color ?? "gray");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ content: string; color: string } | null>(null);

  useEffect(() => {
    if (note) {
      // Keep pin/archive flags fresh; don't overwrite in-progress typing.
      if (!pending.current && content === (initialContent ?? note.content)) {
        setColor(note.color);
      }
    }
  }, [note]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  };

  const saveNow = useCallback(async () => {
    if (!pending.current) return;
    const patch = pending.current;
    pending.current = null;
    setSaveState("saving");
    try {
      await updateQuickNote(noteId, patch);
      setSaveState("saved");
      invalidate();
    } catch {
      setSaveState("error");
    }
  }, [noteId, queryClient]);

  function scheduleSave(nextContent: string, nextColor: string) {
    pending.current = { content: nextContent, color: nextColor };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 600);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void saveNow();
    };
  }, [saveNow]);

  const togglePin = useMutation({
    mutationFn: () => updateQuickNote(noteId, { pinned: !(note?.pinned ?? false) }),
    onSuccess: invalidate,
  });
  const toggleArchive = useMutation({
    mutationFn: () => updateQuickNote(noteId, { archived: !(note?.archived ?? false) }),
    onSuccess: () => {
      invalidate();
      navigation.goBack();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteQuickNote(noteId),
    onSuccess: () => {
      invalidate();
      navigation.goBack();
    },
  });

  useEffect(() => {
    navigation.setOptions({
      title: "Note",
      headerRight: () => (
        <Text
          style={{
            color: saveState === "error" ? colors.danger : colors.textSecondary,
            fontSize: 12,
            paddingRight: 4,
          }}
        >
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : "Saved"}
        </Text>
      ),
    });
  }, [navigation, saveState, colors]);

  const pinned = note?.pinned ?? false;
  const archived = note?.archived ?? false;
  const { isNarrow, isShort, screenPad, insets } = useLayout();
  const dotSize = isNarrow ? 20 : 24;

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
      <View
        style={[
          styles.body,
          {
            padding: screenPad,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <GlassCard
          style={{ flex: 1 }}
          contentStyle={[
            styles.editorCard,
            color !== "gray" ? { backgroundColor: PALETTE[color] } : null,
          ]}
        >
          <TextInput
            style={[
              styles.editor,
              { color: colors.textPrimary, minHeight: isShort ? 160 : 240 },
            ]}
            multiline
            textAlignVertical="top"
            autoFocus
            value={content}
            onChangeText={(next) => {
              setContent(next);
              scheduleSave(next, color);
            }}
            placeholder="Write your note…"
            placeholderTextColor={colors.textSecondary}
          />
        </GlassCard>

        <View style={styles.toolbar}>
          <View style={[styles.dots, isNarrow && { gap: 8 }]}>
            {Object.keys(PALETTE).map((c) => {
              const selected = color === c;
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.7}
                  hitSlop={6}
                  onPress={() => {
                    setColor(c);
                    scheduleSave(content, c);
                  }}
                  style={[
                    styles.dot,
                    {
                      height: dotSize,
                      width: dotSize,
                      borderRadius: dotSize / 2,
                      backgroundColor: DOT_COLORS[c],
                      opacity: selected ? 1 : 0.4,
                      transform: [{ scale: selected ? 1.12 : 1 }],
                    },
                  ]}
                />
              );
            })}
          </View>
          <View style={[styles.actions, isNarrow && { gap: 20 }]}>
            <Pressable onPress={() => togglePin.mutate()} hitSlop={8}>
              <Feather name="star" size={18} color={pinned ? colors.accent : colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => toggleArchive.mutate()} hitSlop={8}>
              <Feather
                name={archived ? "rotate-ccw" : "archive"}
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
            <Pressable onPress={() => remove.mutate()} hitSlop={8}>
              <Feather name="trash-2" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 12 },
  editorCard: { flex: 1, padding: 16 },
  editor: { flex: 1, fontSize: 16, lineHeight: 24 },
  toolbar: { gap: 12, alignItems: "center" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  dot: {},
  actions: { flexDirection: "row", justifyContent: "center", gap: 28, paddingVertical: 4 },
});
