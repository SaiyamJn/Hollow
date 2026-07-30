import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { createNotebook, createPage, createSection, deleteNotebook, fetchNotebooks, unlockNotebook } from "../lib/api";
import type { Notebook } from "../lib/types";
import { getNavMemory } from "../lib/navMemory";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { PromptModal } from "../components/PromptModal";
import { Fab, FabAction } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";

type Prompt =
  | { kind: "new-notebook" }
  | { kind: "new-section"; notebookId: string; notebookTitle: string }
  | { kind: "new-page"; sectionId: string; notebookId: string }
  | { kind: "unlock-notebook"; notebook: Notebook }
  | null;

export default function NotebooksScreen({ navigation }: any) {
  const { colors } = useTheme();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { data: notebooks, isLoading, refetch } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const [prompt, setPrompt] = useState<Prompt>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notebooks"] });

  function openNotebook(nb: Notebook) {
    if (nb.isLocked && !unlock.unlockedNotebooks[nb.id]) {
      setPrompt({ kind: "unlock-notebook", notebook: nb });
      return;
    }
    navigation.navigate("Notebook", { notebookId: nb.id, title: nb.title });
  }

  async function onPromptSubmit(value: string): Promise<string | null> {
    if (!prompt) return null;
    try {
      if (prompt.kind === "new-notebook") {
        await createNotebook(value);
        invalidate();
      } else if (prompt.kind === "new-section") {
        await createSection(prompt.notebookId, value);
        invalidate();
        navigation.navigate("Notebook", { notebookId: prompt.notebookId, title: prompt.notebookTitle });
      } else if (prompt.kind === "new-page") {
        const page = await createPage(prompt.sectionId, value, unlock.sectionPasswords[prompt.sectionId]);
        invalidate();
        navigation.navigate("Page", {
          pageId: page.id,
          sectionId: prompt.sectionId,
          notebookId: prompt.notebookId,
          title: value,
        });
      } else {
        await unlockNotebook(prompt.notebook.id, value);
        unlock.unlockNotebook(
          prompt.notebook.id,
          prompt.notebook.sections.filter((s) => s.isLocked).map((s) => s.id),
          value
        );
        navigation.navigate("Notebook", { notebookId: prompt.notebook.id, title: prompt.notebook.title });
      }
      return null;
    } catch (err: any) {
      return err.response?.data?.error ?? "Something went wrong";
    }
  }

  // Context-aware "+": notebook always; section/page target wherever the user
  // last was in the hierarchy (persisted across launches).
  function fabActions(): FabAction[] {
    const memory = getNavMemory();
    const actions: FabAction[] = [
      { key: "notebook", label: "New notebook", icon: "book", onPress: () => setPrompt({ kind: "new-notebook" }) },
    ];
    if (memory.notebook) {
      const nb = memory.notebook;
      actions.push({
        key: "section",
        label: `New section in "${nb.title}"`,
        icon: "layers",
        onPress: () => setPrompt({ kind: "new-section", notebookId: nb.id, notebookTitle: nb.title }),
      });
    }
    if (memory.section) {
      const sec = memory.section;
      actions.push({
        key: "page",
        label: `New page in "${sec.title}"`,
        icon: "file-text",
        onPress: () => setPrompt({ kind: "new-page", sectionId: sec.id, notebookId: sec.notebookId }),
      });
    }
    return actions;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 170 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {(notebooks ?? []).map((nb) => {
          const sealed = nb.isLocked && !unlock.unlockedNotebooks[nb.id];
          const pageCount = nb.sections.reduce((n, s) => n + s.pages.length, 0);
          return (
            <Pressable key={nb.id} onPress={() => openNotebook(nb)} style={{ marginBottom: 10 }}>
              <GlassCard contentStyle={styles.card}>
                <View style={[styles.iconBox, { backgroundColor: colors.accentSoft }]}>
                  <Feather name={sealed ? "lock" : "book"} size={17} color={sealed ? colors.textSecondary : colors.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: sealed ? colors.textSecondary : colors.textPrimary, fontSize: 15, fontWeight: "500" }}
                    numberOfLines={1}
                  >
                    {nb.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {sealed
                      ? "Sealed · encrypted"
                      : `${nb.sections.length} ${nb.sections.length === 1 ? "section" : "sections"} · ${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
                  </Text>
                </View>
                {nb.isLocked && !sealed && <Feather name="unlock" size={13} color={colors.accent} />}
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    Alert.alert("Delete notebook", `Delete “${nb.title}”? All sections and pages will be removed.`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () =>
                          void deleteNotebook(nb.id).then(() => queryClient.invalidateQueries({ queryKey: ["notebooks"] })),
                      },
                    ])
                  }
                >
                  <Feather name="trash-2" size={15} color={colors.textSecondary} />
                </Pressable>
              </GlassCard>
            </Pressable>
          );
        })}

        {notebooks && notebooks.length === 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 32 }}>
            No notebooks yet — tap + to create one.
          </Text>
        )}
      </ScrollView>

      <Fab actions={fabActions()} />

      <PromptModal
        visible={prompt !== null}
        title={
          prompt?.kind === "new-notebook"
            ? "New notebook"
            : prompt?.kind === "new-section"
              ? "New section"
              : prompt?.kind === "new-page"
                ? "New page"
                : prompt?.kind === "unlock-notebook"
                  ? `Unlock "${prompt.notebook.title}"`
                  : ""
        }
        placeholder={prompt?.kind === "unlock-notebook" ? "Password" : "Title"}
        secure={prompt?.kind === "unlock-notebook"}
        submitLabel={prompt?.kind === "unlock-notebook" ? "Unlock" : "Create"}
        onClose={() => setPrompt(null)}
        onSubmit={onPromptSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  iconBox: { height: 38, width: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
