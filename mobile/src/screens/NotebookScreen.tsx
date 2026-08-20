import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  createPage,
  createSection,
  deletePage,
  deleteSection,
  fetchNotebooks,
  lockSection,
  renamePage,
  renameSection,
  removeSectionLock,
  unlockSection,
} from "../lib/api";
import type { Section } from "../lib/types";
import { getNavMemory, rememberNotebook, rememberSection } from "../lib/navMemory";
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
  | { kind: "new-section" }
  | { kind: "new-page"; section: Section }
  | { kind: "unlock-section"; section: Section; thenOpenPage?: { pageId: string; title: string } }
  | { kind: "rename-section"; section: Section }
  | { kind: "rename-page"; pageId: string; title: string }
  | { kind: "lock-section"; section: Section }
  | { kind: "remove-lock-section"; section: Section }
  | null;

type Confirm =
  | { kind: "section"; section: Section }
  | { kind: "page"; pageId: string; title: string }
  | null;

// Inside one notebook: sections as cards that drop down into their pages.
export default function NotebookScreen({ route, navigation }: any) {
  const { notebookId, title } = route.params as { notebookId: string; title: string };
  const { colors } = useTheme();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance, fabBottomStack } = useLayout();
  const { data: notebooks, isLoading, refetch } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const notebook = notebooks?.find((nb) => nb.id === notebookId);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  useEffect(() => rememberNotebook(notebookId, title), [notebookId, title]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notebooks"] });

  function toggleSection(sec: Section) {
    if (sec.isLocked && !unlock.sectionPasswords[sec.id]) {
      setPrompt({ kind: "unlock-section", section: sec });
      return;
    }
    rememberSection(sec.id, sec.title, notebookId, title);
    animateListChange();
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sec.id) ? next.delete(sec.id) : next.add(sec.id);
      return next;
    });
  }

  function openPage(sec: Section, pageId: string, pageTitle: string) {
    if (sec.isLocked && !unlock.sectionPasswords[sec.id]) {
      setPrompt({ kind: "unlock-section", section: sec, thenOpenPage: { pageId, title: pageTitle } });
      return;
    }
    rememberSection(sec.id, sec.title, notebookId, title);
    navigation.navigate("Page", { pageId, sectionId: sec.id, notebookId, title: pageTitle });
  }

  async function onPromptSubmit(value: string): Promise<string | null> {
    if (!prompt) return null;
    try {
      if (prompt.kind === "new-section") {
        const pw =
          unlock.notebookPasswords[notebookId] ??
          notebook?.sections.map((s) => unlock.sectionPasswords[s.id]).find(Boolean);
        const sec = await createSection(notebookId, value, pw);
        if (pw && sec.isLocked) unlock.setSectionPassword(sec.id, pw);
        rememberSection(sec.id, value, notebookId, title);
        setExpanded((s) => new Set(s).add(sec.id));
        invalidate();
      } else if (prompt.kind === "new-page") {
        const page = await createPage(prompt.section.id, value, unlock.sectionPasswords[prompt.section.id]);
        rememberSection(prompt.section.id, prompt.section.title, notebookId, title);
        invalidate();
        navigation.navigate("Page", {
          pageId: page.id,
          sectionId: prompt.section.id,
          notebookId,
          title: value,
          autoFocus: true,
        });
      } else if (prompt.kind === "rename-section") {
        await renameSection(prompt.section.id, value);
        rememberSection(prompt.section.id, value, notebookId, title);
        invalidate();
      } else if (prompt.kind === "rename-page") {
        await renamePage(prompt.pageId, value);
        invalidate();
      } else if (prompt.kind === "lock-section") {
        if (value.length < 8) return "Password must be at least 8 characters";
        await lockSection(prompt.section.id, value);
        unlock.setSectionPassword(prompt.section.id, value);
        invalidate();
      } else if (prompt.kind === "remove-lock-section") {
        await removeSectionLock(prompt.section.id, value);
        unlock.relockSection(prompt.section.id);
        invalidate();
      } else {
        await unlockSection(prompt.section.id, value);
        unlock.setSectionPassword(prompt.section.id, value);
        rememberSection(prompt.section.id, prompt.section.title, notebookId, title);
        setExpanded((s) => new Set(s).add(prompt.section.id));
        if (prompt.thenOpenPage) {
          navigation.navigate("Page", {
            pageId: prompt.thenOpenPage.pageId,
            sectionId: prompt.section.id,
            notebookId,
            title: prompt.thenOpenPage.title,
          });
        }
      }
      return null;
    } catch (err: any) {
      return err.response?.data?.error ?? "Something went wrong";
    }
  }

  function fabActions(): FabAction[] {
    const actions: FabAction[] = [
      { key: "section", label: "New section", icon: "layers", onPress: () => setPrompt({ kind: "new-section" }) },
    ];
    // Target the section the user is working in (falls back to the first one).
    const memory = getNavMemory();
    const target =
      (memory.section?.notebookId === notebookId
        ? notebook?.sections.find((s) => s.id === memory.section!.id)
        : undefined) ?? notebook?.sections[0];
    if (target) {
      actions.push({
        key: "page",
        label: `New page in "${truncateLabel(target.title)}"`,
        icon: "file-text",
        onPress: () => {
          if (target.isLocked && !unlock.sectionPasswords[target.id]) {
            setPrompt({ kind: "unlock-section", section: target });
          } else {
            setPrompt({ kind: "new-page", section: target });
          }
        },
      });
    }
    return actions;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: screenPad, paddingBottom: stackBottomClearance(true) }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {(notebook?.sections ?? []).map((sec) => {
          const sealed = sec.isLocked && !unlock.sectionPasswords[sec.id];
          const isOpen = expanded.has(sec.id) && !sealed;
          return (
            <GlassCard key={sec.id} style={{ marginBottom: 10 }} contentStyle={styles.cardInner}>
              <View style={styles.sectionRow}>
                <Pressable style={styles.sectionOpen} onPress={() => toggleSection(sec)}>
                  <Feather name={isOpen ? "chevron-down" : "chevron-right"} size={16} color={colors.textSecondary} />
                  <Text
                    style={{
                      color: sealed ? colors.textSecondary : colors.textPrimary,
                      fontSize: 15,
                      fontWeight: "500",
                      flex: 1,
                      minWidth: 0,
                    }}
                    numberOfLines={1}
                  >
                    {sec.title}
                  </Text>
                  {sec.isLocked && sealed && (
                    <Feather name="lock" size={13} color={colors.textSecondary} style={{ flexShrink: 0 }} />
                  )}
                  <Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 0 }}>{sec.pages.length}</Text>
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => setPrompt({ kind: "rename-section", section: sec })}
                  style={{ flexShrink: 0, padding: 4 }}
                  accessibilityLabel="Rename section"
                >
                  <Feather name="edit-2" size={14} color={colors.textSecondary} />
                </Pressable>
                {!sec.isLocked && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => setPrompt({ kind: "lock-section", section: sec })}
                    style={{ flexShrink: 0, padding: 4 }}
                    accessibilityLabel="Lock section"
                  >
                    <Feather name="unlock" size={14} color={colors.textSecondary} />
                  </Pressable>
                )}
                {sec.isLocked && !sealed && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => unlock.relockSection(sec.id)}
                    style={{ flexShrink: 0, padding: 4 }}
                    accessibilityLabel="Re-lock for this session"
                  >
                    <Feather name="lock" size={14} color={colors.accent} />
                  </Pressable>
                )}
                {sec.isLocked && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => setPrompt({ kind: "remove-lock-section", section: sec })}
                    style={{ flexShrink: 0, padding: 4 }}
                    accessibilityLabel="Remove password"
                  >
                    <Feather name="shield-off" size={14} color={colors.textSecondary} />
                  </Pressable>
                )}
                <Pressable
                  hitSlop={8}
                  onPress={() => setConfirm({ kind: "section", section: sec })}
                  style={{ flexShrink: 0, padding: 4 }}
                  accessibilityLabel="Delete section"
                >
                  <Feather name="trash-2" size={14} color={colors.textSecondary} />
                </Pressable>
              </View>

              {isOpen && (
                <View style={[styles.pages, { borderLeftColor: colors.border }]}>
                  {sec.pages.map((page) => (
                    <View key={page.id} style={styles.pageRow}>
                      <Pressable
                        style={styles.pageOpen}
                        onPress={() => openPage(sec, page.id, page.title)}
                      >
                        <Feather name="file-text" size={13} color={colors.textSecondary} />
                        <Text
                          style={{ color: colors.textSecondary, fontSize: 14, flex: 1, minWidth: 0 }}
                          numberOfLines={1}
                        >
                          {page.title}
                        </Text>
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => setPrompt({ kind: "rename-page", pageId: page.id, title: page.title })}
                        style={{ padding: 4 }}
                        accessibilityLabel="Rename page"
                      >
                        <Feather name="edit-2" size={13} color={colors.textSecondary} />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => setConfirm({ kind: "page", pageId: page.id, title: page.title })}
                        style={{ padding: 4 }}
                        accessibilityLabel="Delete page"
                      >
                        <Feather name="trash-2" size={13} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={styles.pageRow} onPress={() => setPrompt({ kind: "new-page", section: sec })}>
                    <Feather name="plus" size={13} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>New page</Text>
                  </Pressable>
                </View>
              )}
            </GlassCard>
          );
        })}

        {notebook && notebook.sections.length === 0 && (
          <EmptyState
            icon="layers"
            title="Empty notebook"
            subtitle="Start a section, then fill it with pages — tap + whenever you're ready."
          />
        )}
      </ScrollView>

      <Fab actions={fabActions()} bottom={fabBottomStack} />

      <PromptModal
        visible={prompt !== null}
        title={
          prompt?.kind === "new-section"
            ? "New section"
            : prompt?.kind === "new-page"
              ? `New page in "${truncateLabel(prompt.section.title, 28)}"`
              : prompt?.kind === "rename-section"
                ? "Rename section"
                : prompt?.kind === "rename-page"
                  ? "Rename page"
                  : prompt?.kind === "lock-section"
                    ? `Lock "${truncateLabel(prompt.section.title, 28)}"`
                    : prompt?.kind === "remove-lock-section"
                      ? `Remove password from "${truncateLabel(prompt.section.title, 28)}"`
                      : prompt?.kind === "unlock-section"
                        ? `Unlock "${truncateLabel(prompt.section.title, 28)}"`
                        : ""
        }
        placeholder={
          prompt?.kind === "unlock-section" ||
          prompt?.kind === "lock-section" ||
          prompt?.kind === "remove-lock-section"
            ? "Password"
            : "Title"
        }
        secure={
          prompt?.kind === "unlock-section" ||
          prompt?.kind === "lock-section" ||
          prompt?.kind === "remove-lock-section"
        }
        submitLabel={
          prompt?.kind === "unlock-section"
            ? "Unlock"
            : prompt?.kind === "lock-section"
              ? "Lock"
              : prompt?.kind === "remove-lock-section"
                ? "Remove"
                : prompt?.kind === "rename-section" || prompt?.kind === "rename-page"
                  ? "Save"
                  : "Create"
        }
        initialValue={
          prompt?.kind === "rename-section"
            ? prompt.section.title
            : prompt?.kind === "rename-page"
              ? prompt.title
              : ""
        }
        onClose={() => setPrompt(null)}
        onSubmit={onPromptSubmit}
      />

      <ConfirmModal
        visible={confirm !== null}
        title={confirm?.kind === "section" ? "Delete section" : "Delete page"}
        message={
          confirm?.kind === "section"
            ? `Delete “${confirm.section.title}”? All pages inside will be permanently removed.`
            : confirm?.kind === "page"
              ? `Delete “${confirm.title}”? This cannot be undone.`
              : ""
        }
        confirmLabel="Delete"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === "section") {
            await deleteSection(confirm.section.id);
            animateListChange();
            setExpanded((prev) => {
              const next = new Set(prev);
              next.delete(confirm.section.id);
              return next;
            });
          } else {
            await deletePage(confirm.pageId);
            animateListChange();
          }
          invalidate();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardInner: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sectionOpen: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, minWidth: 0 },
  pages: { marginLeft: 7, paddingLeft: 14, borderLeftWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  pageRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  pageOpen: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, minWidth: 0 },
});
