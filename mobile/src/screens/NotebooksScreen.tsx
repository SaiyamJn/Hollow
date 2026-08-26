import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { createNotebook, createPage, createSection, deleteNotebook, fetchNotebooks, lockNotebook, renameNotebook, removeNotebookLock, unlockNotebook } from "../lib/api";
import type { Notebook } from "../lib/types";
import { getNavMemory } from "../lib/navMemory";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { ConfirmModal } from "../components/ConfirmModal";
import { PromptModal } from "../components/PromptModal";
import EmptyState from "../components/EmptyState";
import { Fab, FabAction } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";
import { truncateLabel, useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

type Prompt =
  | { kind: "new-notebook" }
  | { kind: "new-section"; notebookId: string; notebookTitle: string }
  | { kind: "new-page"; sectionId: string; notebookId: string }
  | { kind: "unlock-notebook"; notebook: Notebook }
  | { kind: "rename-notebook"; notebook: Notebook }
  | { kind: "lock-notebook"; notebook: Notebook }
  | { kind: "remove-lock-notebook"; notebook: Notebook }
  | null;

export default function NotebooksScreen({ navigation }: any) {
  const { colors } = useTheme();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { screenPad, listBottomClearance, isNarrow } = useLayout();
  const { data: notebooks, isLoading, refetch } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [deleteTarget, setDeleteTarget] = useState<Notebook | null>(null);

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
        const pw =
          unlock.notebookPasswords[prompt.notebookId] ??
          notebooks
            ?.find((nb) => nb.id === prompt.notebookId)
            ?.sections.map((s) => unlock.sectionPasswords[s.id])
            .find(Boolean);
        const sec = await createSection(prompt.notebookId, value, pw);
        if (pw && sec.isLocked) unlock.setSectionPassword(sec.id, pw);
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
          autoFocus: true,
        });
      } else if (prompt.kind === "rename-notebook") {
        await renameNotebook(prompt.notebook.id, value);
        invalidate();
      } else if (prompt.kind === "lock-notebook") {
        if (value.length < 8) return "Password must be at least 8 characters";
        await lockNotebook(prompt.notebook.id, value);
        unlock.unlockNotebook(
          prompt.notebook.id,
          prompt.notebook.sections.map((s) => s.id),
          value
        );
        invalidate();
      } else if (prompt.kind === "remove-lock-notebook") {
        await removeNotebookLock(prompt.notebook.id, value);
        unlock.relockNotebook(
          prompt.notebook.id,
          prompt.notebook.sections.map((s) => s.id)
        );
        invalidate();
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
        label: `New section in "${truncateLabel(nb.title)}"`,
        icon: "layers",
        onPress: () => setPrompt({ kind: "new-section", notebookId: nb.id, notebookTitle: nb.title }),
      });
    }
    if (memory.section) {
      const sec = memory.section;
      actions.push({
        key: "page",
        label: `New page in "${truncateLabel(sec.title)}"`,
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
        contentContainerStyle={{ padding: screenPad, paddingBottom: listBottomClearance(true) }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        scrollEventThrottle={16}
      >
        <View style={{ marginBottom: 12, alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>
            Organize pages — rename anytime.
          </Text>
        </View>
        {(notebooks ?? []).map((nb) => {
          const sealed = nb.isLocked && !unlock.unlockedNotebooks[nb.id];
          const pageCount = nb.sections.reduce((n, s) => n + s.pages.length, 0);
          return (
            <Pressable key={nb.id} onPress={() => openNotebook(nb)} style={{ marginBottom: 10 }}>
              <GlassCard contentStyle={[styles.card, isNarrow && { gap: 8, padding: 12 }]}>
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
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {sealed
                      ? "Sealed · encrypted"
                      : `${nb.sections.length} ${nb.sections.length === 1 ? "section" : "sections"} · ${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
                  </Text>
                </View>
                {nb.isLocked && !sealed && (
                  <Pressable
                    hitSlop={8}
                    style={{ flexShrink: 0 }}
                    onPress={() =>
                      unlock.relockNotebook(
                        nb.id,
                        nb.sections.map((s) => s.id)
                      )
                    }
                    accessibilityLabel="Re-lock for this session"
                  >
                    <Feather name="lock" size={15} color={colors.accent} />
                  </Pressable>
                )}
                {!nb.isLocked && (
                  <Pressable
                    hitSlop={8}
                    style={{ flexShrink: 0 }}
                    onPress={() => setPrompt({ kind: "lock-notebook", notebook: nb })}
                    accessibilityLabel="Lock notebook"
                  >
                    <Feather name="unlock" size={15} color={colors.textSecondary} />
                  </Pressable>
                )}
                {nb.isLocked && (
                  <Pressable
                    hitSlop={8}
                    style={{ flexShrink: 0 }}
                    onPress={() => setPrompt({ kind: "remove-lock-notebook", notebook: nb })}
                  >
                    <Feather name="shield-off" size={15} color={colors.textSecondary} />
                  </Pressable>
                )}
                <Pressable
                  hitSlop={8}
                  style={{ flexShrink: 0 }}
                  onPress={() => setPrompt({ kind: "rename-notebook", notebook: nb })}
                >
                  <Feather name="edit-2" size={15} color={colors.textSecondary} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  style={{ flexShrink: 0 }}
                  onPress={() => setDeleteTarget(nb)}
                >
                  <Feather name="trash-2" size={15} color={colors.textSecondary} />
                </Pressable>
              </GlassCard>
            </Pressable>
          );
        })}

        {notebooks && notebooks.length === 0 && (
          <EmptyState
            icon="book-open"
            title="No notebooks yet"
            subtitle="Tap + for a fresh notebook — sections and pages live inside."
          />
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
                : prompt?.kind === "rename-notebook"
                  ? "Rename notebook"
                  : prompt?.kind === "lock-notebook"
                    ? `Lock "${prompt.notebook.title}"`
                    : prompt?.kind === "remove-lock-notebook"
                      ? `Remove password from "${prompt.notebook.title}"`
                      : prompt?.kind === "unlock-notebook"
                        ? `Unlock "${prompt.notebook.title}"`
                        : ""
        }
        placeholder={
          prompt?.kind === "unlock-notebook" ||
          prompt?.kind === "lock-notebook" ||
          prompt?.kind === "remove-lock-notebook"
            ? "Password"
            : "Title"
        }
        secure={
          prompt?.kind === "unlock-notebook" ||
          prompt?.kind === "lock-notebook" ||
          prompt?.kind === "remove-lock-notebook"
        }
        submitLabel={
          prompt?.kind === "unlock-notebook"
            ? "Unlock"
            : prompt?.kind === "lock-notebook"
              ? "Lock"
              : prompt?.kind === "remove-lock-notebook"
                ? "Remove"
                : prompt?.kind === "rename-notebook"
                  ? "Save"
                  : "Create"
        }
        initialValue={prompt?.kind === "rename-notebook" ? prompt.notebook.title : ""}
        onClose={() => setPrompt(null)}
        onSubmit={onPromptSubmit}
      />

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Delete notebook"
        message={`Delete “${deleteTarget?.title ?? ""}”? All sections and pages will be removed.`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          animateListChange();
          await deleteNotebook(deleteTarget.id);
          void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
        }}
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
