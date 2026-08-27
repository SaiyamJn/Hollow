import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Modal } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import {
  createPage,
  createSection,
  deletePage,
  deleteSection,
  fetchNotebooks,
  lockSection,
  movePage,
  renamePage,
  renameSection,
  removeSectionLock,
  reorderPages,
  reorderSections,
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

type MovePageTarget = { pageId: string; title: string; fromSectionId: string } | null;

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
  const [reorderMode, setReorderMode] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MovePageTarget>(null);

  useEffect(() => rememberNotebook(notebookId, title), [notebookId, title]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            animateListChange();
            setReorderMode((v) => !v);
          }}
          hitSlop={8}
          style={{ paddingHorizontal: 4 }}
          accessibilityLabel="Rearrange sections and pages"
        >
          <Feather name="sliders" size={18} color={reorderMode ? colors.accent : colors.textSecondary} />
        </Pressable>
      ),
    });
  }, [navigation, reorderMode, colors]);

  useEffect(() => {
    if (reorderMode && notebook) {
      setExpanded(new Set(notebook.sections.filter((s) => !s.isLocked || unlock.sectionPasswords[s.id]).map((s) => s.id)));
    }
  }, [reorderMode, notebook, unlock.sectionPasswords]);

  async function shiftSection(index: number, dir: -1 | 1) {
    const sections = notebook?.sections ?? [];
    const j = index + dir;
    if (j < 0 || j >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await reorderSections(notebookId, ids);
    animateListChange();
    invalidate();
  }

  async function shiftPage(section: Section, index: number, dir: -1 | 1) {
    const pages = section.pages;
    const j = index + dir;
    if (j < 0 || j >= pages.length) return;
    const ids = pages.map((p) => p.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await reorderPages(section.id, ids);
    animateListChange();
    invalidate();
  }

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
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        scrollEventThrottle={16}
      >
        <Pressable
          onPress={() => navigation.navigate("RecycleBin", { tab: "pages" })}
          style={[
            styles.binChip,
            { borderColor: colors.border, backgroundColor: colors.surface1, marginBottom: 12, alignSelf: "center" },
          ]}
        >
          <Feather name="trash-2" size={14} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500" }}>
            Recycle bin
          </Text>
          <Feather name="chevron-right" size={14} color={colors.textSecondary} />
        </Pressable>
        {reorderMode && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 10 }}>
            Use arrows to rearrange sections and pages.
          </Text>
        )}
        {(notebook?.sections ?? []).map((sec, secIndex) => {
          const sealed = sec.isLocked && !unlock.sectionPasswords[sec.id];
          const isOpen = expanded.has(sec.id) && !sealed;
          return (
            <GlassCard key={sec.id} style={{ marginBottom: 10 }} contentStyle={styles.cardInner}>
              <View style={styles.sectionRow}>
                {reorderMode && (
                  <View style={styles.reorderCol}>
                    <Pressable hitSlop={6} onPress={() => void shiftSection(secIndex, -1)} disabled={secIndex === 0}>
                      <Feather name="chevron-up" size={16} color={secIndex === 0 ? colors.border : colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      hitSlop={6}
                      onPress={() => void shiftSection(secIndex, 1)}
                      disabled={secIndex === (notebook?.sections.length ?? 0) - 1}
                    >
                      <Feather
                        name="chevron-down"
                        size={16}
                        color={secIndex === (notebook?.sections.length ?? 0) - 1 ? colors.border : colors.textSecondary}
                      />
                    </Pressable>
                  </View>
                )}
                <Pressable style={styles.sectionOpen} onPress={() => !reorderMode && toggleSection(sec)}>
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
                {!reorderMode && (
                <>
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
                </>
                )}
              </View>

              {isOpen && (
                <View style={[styles.pages, { borderLeftColor: colors.border }]}>
                  {sec.pages.map((page, pageIndex) => (
                    <View key={page.id} style={styles.pageRow}>
                      {reorderMode && (
                        <View style={styles.reorderCol}>
                          <Pressable hitSlop={6} onPress={() => void shiftPage(sec, pageIndex, -1)} disabled={pageIndex === 0}>
                            <Feather name="chevron-up" size={14} color={pageIndex === 0 ? colors.border : colors.textSecondary} />
                          </Pressable>
                          <Pressable
                            hitSlop={6}
                            onPress={() => void shiftPage(sec, pageIndex, 1)}
                            disabled={pageIndex === sec.pages.length - 1}
                          >
                            <Feather
                              name="chevron-down"
                              size={14}
                              color={pageIndex === sec.pages.length - 1 ? colors.border : colors.textSecondary}
                            />
                          </Pressable>
                        </View>
                      )}
                      <Pressable
                        style={styles.pageOpen}
                        onPress={() => !reorderMode && openPage(sec, page.id, page.title)}
                      >
                        <Feather name="file-text" size={13} color={colors.textSecondary} />
                        <Text
                          style={{ color: colors.textSecondary, fontSize: 14, flex: 1, minWidth: 0 }}
                          numberOfLines={1}
                        >
                          {page.title}
                        </Text>
                      </Pressable>
                      {!reorderMode && (
                      <>
                      <Pressable
                        hitSlop={8}
                        onPress={() => setMoveTarget({ pageId: page.id, title: page.title, fromSectionId: sec.id })}
                        style={{ padding: 4 }}
                        accessibilityLabel="Move page"
                      >
                        <Feather name="shuffle" size={13} color={colors.textSecondary} />
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
                      </>
                      )}
                    </View>
                  ))}
                  {!reorderMode && (
                  <Pressable style={styles.pageRow} onPress={() => setPrompt({ kind: "new-page", section: sec })}>
                    <Feather name="plus" size={13} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>New page</Text>
                  </Pressable>
                  )}
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

      {moveTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMoveTarget(null)}>
          <Pressable style={styles.moveOverlay} onPress={() => setMoveTarget(null)}>
            <Pressable style={[styles.moveSheet, { backgroundColor: colors.surface1, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600", marginBottom: 4 }}>
                Move “{truncateLabel(moveTarget.title, 28)}”
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>Choose a section</Text>
              <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
                {(notebook?.sections ?? [])
                  .filter((s) => s.id !== moveTarget.fromSectionId)
                  .map((s) => (
                    <Pressable
                      key={s.id}
                      style={[styles.moveRow, { borderColor: colors.border }]}
                      onPress={async () => {
                        await movePage(moveTarget.pageId, s.id);
                        animateListChange();
                        invalidate();
                        setMoveTarget(null);
                      }}
                    >
                      <Feather name="layers" size={14} color={colors.accent} />
                      <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }} numberOfLines={1}>
                        {s.title}
                      </Text>
                    </Pressable>
                  ))}
              </ScrollView>
              <Pressable onPress={() => setMoveTarget(null)} style={{ marginTop: 14, alignSelf: "flex-end", padding: 8 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "500" }}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}

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
        title={confirm?.kind === "section" ? "Delete section" : "Move to recycle bin?"}
        message={
          confirm?.kind === "section"
            ? `Delete “${confirm.section.title}”? All pages inside will be permanently removed.`
            : confirm?.kind === "page"
              ? `Move “${confirm.title}” to the recycle bin? You can restore it within 7 days.`
              : ""
        }
        confirmLabel={confirm?.kind === "page" ? "Move" : "Delete"}
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
  binChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reorderCol: { alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 2 },
  moveOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  moveSheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    marginBottom: 8,
  },
});
