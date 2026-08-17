import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  deleteQuickNote,
  deleteQuickNotePermanent,
  fetchQuickNotes,
  updateQuickNote,
} from "../lib/api";
import type { ChecklistItem } from "../lib/types";
import { packNoteBody, resolveNoteFields } from "../lib/noteFields";
import { useTheme } from "../contexts/theme";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

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

function newItemId() {
  return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isEmptyDraft(
  kind: "note" | "list",
  title: string,
  content: string,
  items: ChecklistItem[]
) {
  if (kind === "list") {
    return !title.trim() && !items.some((i) => i.text.trim());
  }
  return !title.trim() && !content.trim();
}

/** Full-screen quick note / list editor — back returns to the notes list. */
export default function QuickNoteDetailScreen({ route, navigation }: any) {
  const {
    noteId,
    title: initialTitle,
    content: initialContent,
    color: initialColor,
    kind: initialKind,
    autoFocus: autoFocusParam,
  } = route.params as {
    noteId: string;
    title?: string;
    content?: string;
    color?: string;
    kind?: "note" | "list";
    autoFocus?: boolean;
  };
  const shouldAutoFocus = Boolean(autoFocusParam);
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const { data: notes } = useQuery({
    queryKey: ["quicknotes", "all"],
    queryFn: () => fetchQuickNotes(true),
  });
  const note = notes?.find((n) => n.id === noteId);
  const kind = (note?.kind ?? initialKind ?? "note") as "note" | "list";
  const isList = kind === "list";
  // New API always includes title; older APIs omit it — fall back to packing title into content.
  const supportsTitleField = note ? Object.prototype.hasOwnProperty.call(note, "title") : true;

  const seed = resolveNoteFields({
    title: initialTitle ?? note?.title,
    content: initialContent ?? note?.content,
    kind,
  });

  const [title, setTitle] = useState(seed.title);
  const [content, setContent] = useState(seed.content.trim() === "" ? "" : seed.content);
  const [items, setItems] = useState<ChecklistItem[]>(
    () => note?.items ?? (isList ? [{ id: newItemId(), text: "", done: false }] : [])
  );
  const [color, setColor] = useState(initialColor ?? note?.color ?? "gray");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{
    title: string;
    content: string;
    color: string;
    items?: ChecklistItem[];
  } | null>(null);
  const hydrated = useRef(false);
  const discarded = useRef(false);
  const latest = useRef({ title, content, color, items, kind, supportsTitleField });
  latest.current = { title, content, color, items, kind, supportsTitleField };

  useEffect(() => {
    if (!note || hydrated.current) return;
    if (pending.current) return;
    const fields = resolveNoteFields(note);
    setTitle(fields.title);
    setContent(fields.content.trim() === "" ? "" : fields.content);
    setColor(note.color);
    if (note.kind === "list") setItems(note.items ?? []);
    hydrated.current = true;
  }, [note]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
  };

  const buildPatch = useCallback(
    (snap: { title: string; content: string; color: string; items?: ChecklistItem[]; kind: "note" | "list"; supportsTitleField: boolean }) => {
      if (snap.kind === "list") {
        if (snap.supportsTitleField) {
          return {
            title: snap.title,
            content: "",
            color: snap.color,
            items: snap.items,
          };
        }
        return {
          content: snap.title.trim() || " ",
          color: snap.color,
          items: snap.items,
        };
      }

      if (snap.supportsTitleField) {
        // Never send empty content alone — older gateways still reject content.min(1).
        return {
          title: snap.title,
          content: snap.content.trim() ? snap.content : snap.title.trim() ? snap.content : " ",
          color: snap.color,
        };
      }

      // Legacy: embed title in the content body.
      const packed = packNoteBody(snap.title, snap.content);
      return { content: packed.trim() ? packed : " ", color: snap.color };
    },
    []
  );

  const saveNow = useCallback(async () => {
    if (!pending.current || discarded.current) return;
    const snap = pending.current;
    pending.current = null;
    setSaveState("saving");
    try {
      await updateQuickNote(
        noteId,
        buildPatch({ ...snap, kind: latest.current.kind, supportsTitleField: latest.current.supportsTitleField })
      );
      setSaveState("saved");
      invalidate();
    } catch {
      // Retry once with packed content if title field was rejected.
      try {
        const packed = packNoteBody(snap.title, snap.content);
        await updateQuickNote(noteId, {
          content: packed.trim() ? packed : " ",
          color: snap.color,
          ...(latest.current.kind === "list" ? { items: snap.items } : {}),
        });
        setSaveState("saved");
        invalidate();
      } catch {
        setSaveState("error");
      }
    }
  }, [noteId, queryClient, buildPatch]);

  function scheduleSave(
    nextTitle: string,
    nextContent: string,
    nextColor: string,
    nextItems?: ChecklistItem[]
  ) {
    pending.current = {
      title: nextTitle,
      content: nextContent,
      color: nextColor,
      ...(isList ? { items: nextItems ?? items } : {}),
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 500);
  }

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      if (discarded.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const snap = latest.current;
      if (shouldAutoFocus && isEmptyDraft(snap.kind, snap.title, snap.content, snap.items)) {
        discarded.current = true;
        pending.current = null;
        void deleteQuickNotePermanent(noteId).then(invalidate);
        return;
      }
      if (pending.current) {
        void saveNow();
      }
    });
    return unsub;
  }, [navigation, noteId, saveNow, shouldAutoFocus]);

  useEffect(() => {
    return () => {
      if (discarded.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const snap = latest.current;
      if (shouldAutoFocus && isEmptyDraft(snap.kind, snap.title, snap.content, snap.items)) {
        discarded.current = true;
        pending.current = null;
        void deleteQuickNotePermanent(noteId).then(() => {
          void queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
        });
        return;
      }
      void saveNow();
    };
  }, [noteId, queryClient, saveNow, shouldAutoFocus]);

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
    onMutate: () => {
      discarded.current = true;
      pending.current = null;
      animateListChange();
    },
    onSuccess: () => {
      invalidate();
      navigation.goBack();
    },
  });

  useEffect(() => {
    navigation.setOptions({
      title: isList ? "List" : "Note",
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
  }, [navigation, saveState, colors, isList]);

  function patchItems(next: ChecklistItem[]) {
    setItems(next);
    scheduleSave(title, content, color, next);
  }

  function updateItem(id: string, patch: Partial<ChecklistItem>) {
    patchItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addItem() {
    patchItems([...items, { id: newItemId(), text: "", done: false }]);
  }

  function removeItem(id: string) {
    const next = items.filter((i) => i.id !== id);
    patchItems(next.length ? next : [{ id: newItemId(), text: "", done: false }]);
  }

  const pinned = note?.pinned ?? false;
  const archived = note?.archived ?? false;
  const { isNarrow, isShort, screenPad, insets } = useLayout();
  const dotSize = isNarrow ? 20 : 24;
  const openItems = items.filter((i) => !i.done);
  const doneItems = items.filter((i) => i.done);

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
          {isList ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                style={[styles.title, { color: colors.textPrimary }]}
                placeholder="List title"
                placeholderTextColor={colors.textSecondary}
                value={title}
                autoFocus={shouldAutoFocus}
                onChangeText={(next) => {
                  setTitle(next);
                  scheduleSave(next, content, color, items);
                }}
              />
              {openItems.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onToggle={() => updateItem(item.id, { done: !item.done })}
                  onChangeText={(text) => updateItem(item.id, { text })}
                  onRemove={() => removeItem(item.id)}
                  onSubmit={addItem}
                />
              ))}
              <Pressable onPress={addItem} style={styles.addRow} hitSlop={6}>
                <Feather name="plus" size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>List item</Text>
              </Pressable>
              {doneItems.length > 0 && (
                <View style={{ marginTop: 16, gap: 2 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, letterSpacing: 0.6, marginBottom: 6 }}>
                    CHECKED OFF ({doneItems.length})
                  </Text>
                  {doneItems.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      onToggle={() => updateItem(item.id, { done: !item.done })}
                      onChangeText={(text) => updateItem(item.id, { text })}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                style={[styles.title, { color: colors.textPrimary }]}
                placeholder="Title"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={(next) => {
                  setTitle(next);
                  scheduleSave(next, content, color);
                }}
              />
              <TextInput
                style={[
                  styles.editor,
                  { color: colors.textPrimary, minHeight: isShort ? 160 : 240 },
                ]}
                multiline
                textAlignVertical="top"
                autoFocus={shouldAutoFocus}
                value={content}
                onChangeText={(next) => {
                  setContent(next);
                  scheduleSave(title, next, color);
                }}
                placeholder="Write your note…"
                placeholderTextColor={colors.textSecondary}
              />
            </ScrollView>
          )}
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
                    scheduleSave(title, content, c, isList ? items : undefined);
                  }}
                  style={{
                    height: dotSize,
                    width: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: DOT_COLORS[c],
                    opacity: selected ? 1 : 0.4,
                    transform: [{ scale: selected ? 1.12 : 1 }],
                  }}
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

function ChecklistRow({
  item,
  onToggle,
  onChangeText,
  onRemove,
  onSubmit,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onRemove: () => void;
  onSubmit?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.checkRow}>
      <Pressable onPress={onToggle} hitSlop={8} style={{ paddingTop: 2 }}>
        <Feather
          name={item.done ? "check-square" : "square"}
          size={18}
          color={item.done ? colors.accent : colors.textSecondary}
        />
      </Pressable>
      <TextInput
        style={[
          styles.checkInput,
          {
            color: item.done ? colors.textSecondary : colors.textPrimary,
            textDecorationLine: item.done ? "line-through" : "none",
          },
        ]}
        value={item.text}
        onChangeText={onChangeText}
        placeholder="List item"
        placeholderTextColor={colors.textSecondary}
        onSubmitEditing={onSubmit}
        returnKeyType="next"
      />
      <Pressable onPress={onRemove} hitSlop={8}>
        <Feather name="x" size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 12 },
  editorCard: { flex: 1, padding: 16 },
  editor: { flex: 1, fontSize: 16, lineHeight: 24 },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 8, paddingVertical: 4 },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
  },
  checkInput: { flex: 1, fontSize: 15, lineHeight: 22, paddingVertical: 0 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 2,
  },
  toolbar: { gap: 12, alignItems: "center" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  actions: { flexDirection: "row", justifyContent: "center", gap: 28, paddingVertical: 4 },
});
