import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { fetchNotebooks, openDailyNote } from "../lib/api";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";

interface SearchItem {
  id: string;
  label: string;
  hint?: string;
  icon: keyof typeof Feather.glyphMap;
  locked?: boolean;
  run: () => void;
}

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  /** Navigation of the enclosing stack, used to open pages/tabs. */
  navigation: any;
}

// Mobile counterpart of the web command palette: search every page and run
// common actions from anywhere.
export function SearchModal({ visible, onClose, navigation }: SearchModalProps) {
  const { theme, colors } = useTheme();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");

  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks, enabled: visible });

  const daily = useMutation({
    mutationFn: openDailyNote,
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      navigation.navigate("Page", {
        pageId: note.id,
        sectionId: note.sectionId,
        notebookId: note.notebookId,
        title: note.title,
      });
    },
  });

  function close() {
    setQuery("");
    onClose();
  }

  const items = useMemo<SearchItem[]>(() => {
    const actions: SearchItem[] = [
      {
        id: "daily",
        label: "Open today's daily note",
        hint: "Journal",
        icon: "calendar",
        run: () => {
          close();
          daily.mutate();
        },
      },
      {
        id: "quick-note",
        label: "New quick note",
        icon: "file-text",
        run: () => {
          close();
          navigation.navigate("Tabs", { screen: "Quick notes" });
        },
      },
      {
        id: "tasks",
        label: "Go to tasks",
        icon: "check-square",
        run: () => {
          close();
          navigation.navigate("Tabs", { screen: "Tasks" });
        },
      },
    ];

    const pages: SearchItem[] = (notebooks ?? []).flatMap((nb) =>
      nb.sections.flatMap((sec) =>
        sec.pages.map((p) => ({
          id: `page-${p.id}`,
          label: p.title,
          hint: `${nb.title} / ${sec.title}`,
          icon: "file-text" as const,
          locked: sec.isLocked && !unlock.sectionPasswords[sec.id],
          run: () => {
            close();
            navigation.navigate("Page", {
              pageId: p.id,
              sectionId: sec.id,
              notebookId: sec.notebookId,
              title: p.title,
            });
          },
        }))
      )
    );

    return [...actions, ...pages];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebooks, unlock.sectionPasswords, navigation]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 15);
    return items.filter((item) => `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(q)).slice(0, 15);
  }, [items, query]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={[styles.panel, { borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <BlurView
              intensity={60}
              tint={theme === "dark" ? "dark" : "light"}
              experimentalBlurMethod="dimezisBlurView"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
            />
            <View style={[styles.inputRow, { borderBottomColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Search pages, or run a command…"
                placeholderTextColor={colors.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
              />
              <Pressable onPress={close} hitSlop={8}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 380 }}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", padding: 20 }}>
                  No matches.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable style={styles.itemRow} onPress={item.run}>
                  <Feather name={item.icon} size={15} color={colors.textSecondary} />
                  <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.locked && <Feather name="lock" size={12} color={colors.textSecondary} />}
                  {item.hint && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, maxWidth: "40%" }} numberOfLines={1}>
                      {item.hint}
                    </Text>
                  )}
                </Pressable>
              )}
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  panel: {
    marginTop: 70,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 13 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
});
