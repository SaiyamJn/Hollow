import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { createPage, createSection, fetchNotebooks, unlockSection } from "../lib/api";
import type { Section } from "../lib/types";
import { getNavMemory, rememberNotebook, rememberSection } from "../lib/navMemory";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { PromptModal } from "../components/PromptModal";
import { Fab, FabAction } from "../components/Fab";
import { GlassCard } from "../components/GlassCard";
import { truncateLabel, useLayout } from "../lib/layout";
import { animateListChange } from "../lib/motion";

type Prompt =
  | { kind: "new-section" }
  | { kind: "new-page"; section: Section }
  | { kind: "unlock-section"; section: Section; thenOpenPage?: { pageId: string; title: string } }
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
        navigation.navigate("Page", { pageId: page.id, sectionId: prompt.section.id, notebookId, title: value });
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
              <Pressable style={styles.sectionRow} onPress={() => toggleSection(sec)}>
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
                {sec.isLocked && (
                  <Feather
                    name={sealed ? "lock" : "unlock"}
                    size={13}
                    color={sealed ? colors.textSecondary : colors.accent}
                    style={{ flexShrink: 0 }}
                  />
                )}
                <Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 0 }}>{sec.pages.length}</Text>
              </Pressable>

              {isOpen && (
                <View style={[styles.pages, { borderLeftColor: colors.border }]}>
                  {sec.pages.map((page) => (
                    <Pressable key={page.id} style={styles.pageRow} onPress={() => openPage(sec, page.id, page.title)}>
                      <Feather name="file-text" size={13} color={colors.textSecondary} />
                      <Text
                        style={{ color: colors.textSecondary, fontSize: 14, flex: 1, minWidth: 0 }}
                        numberOfLines={1}
                      >
                        {page.title}
                      </Text>
                    </Pressable>
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
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 32 }}>
            No sections yet — tap + to create one.
          </Text>
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
              : prompt?.kind === "unlock-section"
                ? `Unlock "${truncateLabel(prompt.section.title, 28)}"`
                : ""
        }
        placeholder={prompt?.kind === "unlock-section" ? "Password" : "Title"}
        secure={prompt?.kind === "unlock-section"}
        submitLabel={prompt?.kind === "unlock-section" ? "Unlock" : "Create"}
        onClose={() => setPrompt(null)}
        onSubmit={onPromptSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardInner: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  pages: { marginLeft: 7, paddingLeft: 14, borderLeftWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  pageRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
});
