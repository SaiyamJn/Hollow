import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
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
import { NOTE_COLOR_KEYS, noteTint } from "../theme";
import { ConfirmModal } from "../components/ConfirmModal";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

const DOT_COLORS: Record<string, string> = {
  gray: "#8a8d93",
  yellow: "rgb(250, 184, 8)",
  green: "rgb(16, 185, 129)",
  blue: "rgb(59, 130, 246)",
  red: "rgb(244, 63, 94)",
  purple: "rgb(168, 85, 247)",
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
  const [focusId, setFocusId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emptyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{
    title: string;
    content: string;
    color: string;
    items?: ChecklistItem[];
  } | null>(null);
  const hydrated = useRef(false);
  const discarded = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

    // Auto-delete the moment the note/list becomes empty while editing, so an
    // emptied note doesn't linger. Brand-new drafts are removed outright; an
    // existing note goes to the recycle bin (restorable within 7 days).
    if (emptyTimer.current) clearTimeout(emptyTimer.current);
    if (isEmptyDraft(kind, nextTitle, nextContent, nextItems ?? items)) {
      emptyTimer.current = setTimeout(() => {
        if (discarded.current) return;
        discarded.current = true;
        pending.current = null;
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        void (shouldAutoFocus
          ? deleteQuickNotePermanent(noteId)
          : deleteQuickNote(noteId)
        ).then(() => {
          queryClient.invalidateQueries({ queryKey: ["quicknotes"] });
          navigation.goBack();
        });
      }, 800);
    }
  }

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      if (discarded.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (emptyTimer.current) clearTimeout(emptyTimer.current);
      const snap = latest.current;
      // Auto-delete notes/lists left empty. Brand-new drafts are removed outright;
      // an emptied existing note goes to the recycle bin so it can be restored.
      if (isEmptyDraft(snap.kind, snap.title, snap.content, snap.items)) {
        discarded.current = true;
        pending.current = null;
        void (shouldAutoFocus
          ? deleteQuickNotePermanent(noteId)
          : deleteQuickNote(noteId)
        ).then(invalidate);
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
      if (emptyTimer.current) clearTimeout(emptyTimer.current);
      const snap = latest.current;
      // Auto-delete notes/lists left empty, whether freshly created or emptied here.
      if (isEmptyDraft(snap.kind, snap.title, snap.content, snap.items)) {
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

  async function exportNote() {
    const name = title.trim() || (isList ? "List" : "Note");
    let body = name;
    if (isList) {
      body = items
        .map((i) => `${i.done ? "- [x]" : "- [ ]"} ${i.text.trim() || "Item"}`)
        .join("\n");
    } else {
      body = content.trim() || name;
    }
    try {
      await Share.share({ message: body, title: name });
    } catch {
      // user cancelled
    }
  }

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
    animateListChange();
    setItems(next);
    scheduleSave(title, content, color, next);
  }

  function updateItem(id: string, patch: Partial<ChecklistItem>) {
    patchItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addItem() {
    const id = newItemId();
    patchItems([...items, { id, text: "", done: false }]);
    // Focus the fresh row so pressing Enter keeps the keyboard open and the
    // caret lands in the next empty item instead of dismissing.
    setFocusId(id);
  }

  function removeItem(id: string) {
    const next = items.filter((i) => i.id !== id);
    patchItems(next.length ? next : [{ id: newItemId(), text: "", done: false }]);
  }

  const pinned = note?.pinned ?? false;
  const archived = note?.archived ?? false;
  const { isNarrow, screenPad, insets } = useLayout();
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
            color !== "gray" ? { backgroundColor: noteTint(colors, color) } : null,
          ]}
        >
          {isList ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={{ flex: 1 }}>
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
                  focusId={focusId}
                  onToggle={() => updateItem(item.id, { done: !item.done })}
                  onChangeText={(text) => {
                    if (focusId === item.id) setFocusId(null);
                    updateItem(item.id, { text });
                  }}
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
            <View style={{ flex: 1 }}>
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
                  { color: colors.textPrimary, flex: 1 },
                ]}
                multiline
                scrollEnabled
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
            </View>
          )}
        </GlassCard>

        <View style={styles.toolbar}>
          <View style={[styles.dots, isNarrow && { gap: 8 }]}>
            {NOTE_COLOR_KEYS.map((c) => {
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
            <Pressable onPress={() => void exportNote()} hitSlop={8} accessibilityLabel="Export note">
              <Feather name="share-2" size={18} color={colors.textSecondary} />
            </Pressable>
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
            <Pressable onPress={() => setConfirmDelete(true)} hitSlop={8}>
              <Feather name="trash-2" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      </View>
      <ConfirmModal
        visible={confirmDelete}
        title="Move to recycle bin?"
        message="You can restore it within 7 days."
        confirmLabel="Move"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </KeyboardSafe>
  );
}

function ChecklistRow({
  item,
  onToggle,
  onChangeText,
  onRemove,
  onSubmit,
  focusId,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onRemove: () => void;
  onSubmit?: () => void;
  focusId?: string | null;
}) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (focusId === item.id) inputRef.current?.focus();
  }, [focusId, item.id]);
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
        ref={inputRef}
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
  editorCard: { flex: 1, minHeight: 0, padding: 16 },
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
