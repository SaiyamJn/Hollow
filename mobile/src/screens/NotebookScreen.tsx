import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
  type View as ViewType,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import {
  ACTIVATE_PX,
  DraggableRow,
  hitTestSlot,
  type DragSlot,
} from "../components/DraggableRow";

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
// Reorder sections and pages by long-pressing a row and dragging it.
export default function NotebookScreen({ route, navigation }: any) {
  const { notebookId, title } = route.params as { notebookId: string; title: string };
  const { colors } = useTheme();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { screenPad, stackBottomClearance, fabBottomStack } = useLayout();
  const { data: notebooks, isLoading, refetch } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const notebook = notebooks?.find((nb) => nb.id === notebookId);
  const notebookRef = useRef(notebook);
  notebookRef.current = notebook;

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const mem = getNavMemory();
    return mem.section?.notebookId === notebookId && mem.section?.id ? new Set([mem.section.id]) : new Set();
  });
  const isSecUnlocked = useCallback(
    (secId: string) => !!(unlock.sectionPasswords[secId] || (notebookId && unlock.notebookPasswords[notebookId])),
    [unlock.sectionPasswords, unlock.notebookPasswords, notebookId]
  );
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [moveTarget, setMoveTarget] = useState<MovePageTarget>(null);

  // ── Long-press drag reorder state ─────────────────────────────────────────
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const armedRef = useRef(false);
  const dragSlotRef = useRef<string | null>(null);
  const hoverSlotRef = useRef<string | null>(null);
  const startPageX = useRef(0);
  const startPageY = useRef(0);
  const containerX = useRef(0);
  const containerY = useRef(0);
  const rowRefs = useRef<Map<string, ViewType | null>>(new Map());
  const slotsRef = useRef<DragSlot[]>([]);
  const ghostOrigin = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const dragScale = useRef(new Animated.Value(1)).current;

  useEffect(() => rememberNotebook(notebookId, title), [notebookId, title]);

  const registerSlot = useCallback((slotKey: string, view: ViewType | null) => {
    if (view) rowRefs.current.set(slotKey, view);
    else rowRefs.current.delete(slotKey);
  }, []);

  function measureContainer() {
    contentRef.current?.measureInWindow((x, y) => {
      containerX.current = x;
      containerY.current = y;
    });
  }

  /** Measure every reorderable row's screen position once (rows are static during a drag). */
  function measureAllSlots() {
    contentRef.current?.measureInWindow((cx, cy) => {
      containerX.current = cx;
      containerY.current = cy;
      const slots: DragSlot[] = [];
      let pending = 0;
      rowRefs.current.forEach((view, key) => {
        if (!view) return;
        pending++;
        view.measureInWindow((x, y, _w, h) => {
          slots.push({ slotKey: key, top: y - cy, height: h });
          pending--;
          if (pending === 0) slotsRef.current = slots;
        });
      });
    });
  }

  function handleArm(slotKey: string) {
    if (armedRef.current) return;
    armedRef.current = true;
    dragSlotRef.current = slotKey;
    startPageX.current = 0;
    startPageY.current = 0;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    contentRef.current?.measureInWindow((cx, cy) => {
      containerX.current = cx;
      containerY.current = cy;
      const view = rowRefs.current.get(slotKey);
      view?.measureInWindow((x, y, w, h) => {
        ghostOrigin.current = { left: x - cx, top: y - cy, width: w, height: h };
        dragX.setValue(0);
        dragY.setValue(0);
        Animated.spring(dragScale, { toValue: 1.03, useNativeDriver: true, friction: 9, tension: 110 }).start();
      });
    });
    measureAllSlots();
    setDragging(slotKey);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notebooks"] });

  function doReorder(fromSlot: string, toSlot: string) {
    const nb = notebookRef.current;
    if (!nb) return;
    const fromIsSec = fromSlot.startsWith("sec:");
    const toIsSec = toSlot.startsWith("sec:");
    if (fromIsSec && toIsSec) {
      const i = nb.sections.findIndex((s) => `sec:${s.id}` === fromSlot);
      const j = nb.sections.findIndex((s) => `sec:${s.id}` === toSlot);
      if (i < 0 || j < 0) return;
      const ids = nb.sections.map((s) => s.id);
      const [m] = ids.splice(i, 1);
      ids.splice(j, 0, m);
      animateListChange();
      void reorderSections(notebookId, ids).then(invalidate);
    } else if (!fromIsSec && !toIsSec) {
      const fromSec = nb.sections.find((s) => s.pages.some((p) => `page:${p.id}` === fromSlot));
      const toSec = nb.sections.find((s) => s.pages.some((p) => `page:${p.id}` === toSlot));
      if (!fromSec || !toSec || fromSec.id !== toSec.id) return;
      const i = fromSec.pages.findIndex((p) => `page:${p.id}` === fromSlot);
      const j = toSec.pages.findIndex((p) => `page:${p.id}` === toSlot);
      if (i < 0 || j < 0) return;
      const ids = fromSec.pages.map((p) => p.id);
      const [m] = ids.splice(i, 1);
      ids.splice(j, 0, m);
      animateListChange();
      void reorderPages(fromSec.id, ids).then(invalidate);
    }
    // Section ↔ page drags are ignored (no cross-level reorder).
  }

  function finishDrag() {
    if (!armedRef.current && !dragSlotRef.current) return;
    Animated.parallel([
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, friction: 9, tension: 100 }),
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 100 }),
      Animated.spring(dragScale, { toValue: 1, useNativeDriver: true, friction: 9 }),
    ]).start();
    const from = dragSlotRef.current;
    const to = hoverSlotRef.current;
    armedRef.current = false;
    dragSlotRef.current = null;
    hoverSlotRef.current = null;
    ghostOrigin.current = null;
    slotsRef.current = [];
    startPageX.current = 0;
    startPageY.current = 0;
    setDragging(null);
    setHoverTarget(null);
    if (from && to && from !== to) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      doReorder(from, to);
    }
  }

  // PanResponder lives on the ScrollView. It only claims the responder once a
  // row has been long-pressed (armedRef), so normal scrolling is untouched.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => armedRef.current,
      onStartShouldSetPanResponderCapture: () => armedRef.current,
      onMoveShouldSetPanResponder: () => armedRef.current,
      onMoveShouldSetPanResponderCapture: () => armedRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startPageX.current = e.nativeEvent.pageX;
        startPageY.current = e.nativeEvent.pageY;
      },
      onPanResponderMove: (e) => {
        const { pageX, pageY } = e.nativeEvent;
        if (startPageX.current === 0 && startPageY.current === 0) {
          startPageX.current = pageX;
          startPageY.current = pageY;
        }
        const dx = pageX - startPageX.current;
        const dy = pageY - startPageY.current;
        dragX.setValue(dx);
        dragY.setValue(dy);
        if (!armedRef.current) {
          if (Math.hypot(dx, dy) < ACTIVATE_PX) return;
          armedRef.current = true;
          void Haptics.selectionAsync();
        }
        if (slotsRef.current.length === 0) measureAllSlots();
        const target = hitTestSlot(
          pageX,
          pageY,
          containerX.current,
          containerY.current,
          slotsRef.current,
          dragSlotRef.current
        );
        const key = target?.slotKey ?? null;
        if (key !== hoverSlotRef.current) {
          hoverSlotRef.current = key;
          setHoverTarget(key);
          if (key) void Haptics.selectionAsync();
        }
      },
      onPanResponderRelease: finishDrag,
      onPanResponderTerminate: finishDrag,
    })
  ).current;

  function toggleSection(sec: Section) {
    if (sec.isLocked && !isSecUnlocked(sec.id)) {
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
    if (sec.isLocked && !isSecUnlocked(sec.id)) {
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
        const page = await createPage(
          prompt.section.id,
          value,
          unlock.sectionPasswords[prompt.section.id] ?? unlock.notebookPasswords[notebookId]
        );
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
          if (target.isLocked && !isSecUnlocked(target.id)) {
            setPrompt({ kind: "unlock-section", section: target });
          } else {
            setPrompt({ kind: "new-page", section: target });
          }
        },
      });
    }
    return actions;
  }

  const hoverBorder = { borderColor: colors.accent, borderWidth: 1.5 };

  /** Body of a section row (shared between in-place render and the drag ghost). */
  function renderSectionBody(sec: Section) {
    const sealed = sec.isLocked && !isSecUnlocked(sec.id);
    const isOpen = expanded.has(sec.id) && !sealed;
    return (
      <>
        <View style={styles.sectionRow}>
          <Pressable
            style={styles.sectionOpen}
            onPress={() => !dragging && toggleSection(sec)}
            onLongPress={() => handleArm(`sec:${sec.id}`)}
            delayLongPress={350}
          >
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
            {sec.pages.map((page) => {
              const pageSlotKey = `page:${page.id}`;
              return (
                <DraggableRow
                  key={page.id}
                  slotKey={pageSlotKey}
                  registerSlot={registerSlot}
                  hovered={hoverTarget === pageSlotKey}
                  hoverColor={colors.accent}
                >
                  {renderPageRow(sec, page)}
                </DraggableRow>
              );
            })}
            <Pressable style={styles.pageRow} onPress={() => setPrompt({ kind: "new-page", section: sec })}>
              <Feather name="plus" size={13} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>New page</Text>
            </Pressable>
          </View>
        )}
      </>
    );
  }

  /** Body of a page row (shared between in-place render and the drag ghost). */
  function renderPageRow(sec: Section, page: { id: string; title: string }) {
    return (
      <View style={styles.pageRow}>
        <Pressable
          style={styles.pageOpen}
          onPress={() => !dragging && openPage(sec, page.id, page.title)}
          onLongPress={() => handleArm(`page:${page.id}`)}
          delayLongPress={350}
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
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        scrollEnabled={!dragging}
        {...pan.panHandlers}
        contentContainerStyle={{ padding: screenPad, paddingBottom: stackBottomClearance(true) }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        bounces={true}
        scrollEventThrottle={16}
      >
        <View ref={contentRef} onLayout={measureContainer}>
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

          {(notebook?.sections ?? []).map((sec) => {
            const slotKey = `sec:${sec.id}`;
            return (
              <DraggableRow
                key={sec.id}
                slotKey={slotKey}
                registerSlot={registerSlot}
                hovered={hoverTarget === slotKey}
                style={{ marginBottom: 10, opacity: dragging === slotKey ? 0.35 : 1 }}
              >
                {renderSectionBody(sec)}
              </DraggableRow>
            );
          })}

          {notebook && notebook.sections.length === 0 && (
            <EmptyState
              icon="layers"
              title="Empty notebook"
              subtitle="Start a section, then fill it with pages — tap + whenever you're ready."
            />
          )}

          {dragging && ghostOrigin.current && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                zIndex: 40,
                elevation: 14,
                left: ghostOrigin.current.left,
                top: ghostOrigin.current.top,
                width: ghostOrigin.current.width,
                transform: [{ translateX: dragX }, { translateY: dragY }, { scale: dragScale }],
                shadowColor: "#000",
                shadowOpacity: 0.28,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                borderRadius: 14,
                backgroundColor: colors.surface0,
              }}
            >
              <View style={[hoverBorder, { borderRadius: 14 }]}>
                {renderDraggedBody(dragging)}
              </View>
            </Animated.View>
          )}
        </View>
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

  /** Renders the currently-dragged row's content for the floating ghost. */
  function renderDraggedBody(slotKey: string) {
    if (slotKey.startsWith("sec:")) {
      const sec = notebookRef.current?.sections.find((s) => `sec:${s.id}` === slotKey);
      return sec ? renderSectionBody(sec) : null;
    }
    for (const sec of notebookRef.current?.sections ?? []) {
      const page = sec.pages.find((p) => `page:${p.id}` === slotKey);
      if (page) return renderPageRow(sec, page);
    }
    return null;
  }
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
