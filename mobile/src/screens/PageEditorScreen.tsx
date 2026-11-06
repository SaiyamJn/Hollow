import React, { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { deletePage, fetchNotebooks, fetchPage, lockSection, renamePage, removeSectionLock, resolveMediaUrl, savePageContent, unlockSection } from "../lib/api";
import { contentToText, extractPageSegments, isRichContent, textToBlockNoteJson } from "../lib/content";
import { rememberSection } from "../lib/navMemory";
import { PAGE_TEMPLATES } from "../lib/templates";
import { loadPagePosition, savePagePosition } from "../lib/pagePosition";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { PromptModal } from "../components/PromptModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";
import { useLayout } from "../lib/layout";

// Error boundary to catch any unexpected render crash and keep the app alive
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
class ScreenErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("PageEditorScreen caught error:", error, errorInfo);
  }
  reset = () => {
    this.setState({ hasError: false, error: null });
  };
  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

// Slow breathing ring around the lock emblem on sealed content.
function VaultSeal({ color, background }: { color: string; background: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          styles.sealRing,
          {
            backgroundColor: background,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          },
        ]}
      />
      <View style={[styles.sealBox, { backgroundColor: background }]}>
        <Feather name="lock" size={22} color={color} />
      </View>
    </View>
  );
}

interface NotebookCommand {
  id: string;
  label: string;
  desc: string;
  icon: keyof typeof Feather.glyphMap;
  prefix: string;
  suffix?: string;
}

const NOTEBOOK_COMMANDS: NotebookCommand[] = [
  { id: "h1", label: "Heading 1", desc: "Large section heading", icon: "type", prefix: "# " },
  { id: "h2", label: "Heading 2", desc: "Medium section heading", icon: "type", prefix: "## " },
  { id: "h3", label: "Heading 3", desc: "Small section heading", icon: "type", prefix: "### " },
  { id: "todo", label: "To-do checklist", desc: "Track tasks with checkmarks", icon: "check-square", prefix: "- [ ] " },
  { id: "bullet", label: "Bullet list", desc: "Create an unordered list", icon: "list", prefix: "- " },
  { id: "number", label: "Numbered list", desc: "Create an ordered list", icon: "hash", prefix: "1. " },
  { id: "quote", label: "Quote", desc: "Capture a callout or quote", icon: "message-square", prefix: "> " },
  { id: "code", label: "Code block", desc: "Capture code snippet", icon: "code", prefix: "```\n", suffix: "\n```" },
  { id: "divider", label: "Divider", desc: "Visual horizontal line", icon: "minus", prefix: "\n---\n" },
  { id: "bold", label: "Bold text", desc: "Emphasize with **bold**", icon: "bold", prefix: "**", suffix: "**" },
  { id: "italic", label: "Italic text", desc: "Emphasize with *italic*", icon: "italic", prefix: "*", suffix: "*" },
  { id: "link", label: "Wiki link", desc: "Link to another notebook page", icon: "link-2", prefix: "[[" },
  { id: "date", label: "Today's date", desc: "Insert current date", icon: "calendar", prefix: `${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} ` },
];

export default function PageEditorScreen(props: any) {
  const { navigation } = props;
  const { colors } = useTheme();

  return (
    <ScreenErrorBoundary
      fallback={(err, reset) => (
        <View style={[styles.center, { backgroundColor: colors.surface0, padding: 24 }]}>
          <Feather name="alert-triangle" size={36} color={colors.accent} />
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "600", marginTop: 14 }}>
            Couldn't load this page
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6, marginBottom: 20, textAlign: "center" }}>
            {err?.message ?? "An unexpected error occurred while loading the page."}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              style={[styles.unlockBtn, { backgroundColor: colors.accentSoft }]}
              onPress={reset}
            >
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "500" }}>Try again</Text>
            </Pressable>
            <Pressable
              style={[styles.unlockBtn, { backgroundColor: colors.surface1, borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => navigation?.goBack?.()}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>Back</Text>
            </Pressable>
          </View>
        </View>
      )}
    >
      <PageEditorInner {...props} />
    </ScreenErrorBoundary>
  );
}

function PageEditorInner({ route, navigation }: any) {
  const params = (route?.params ?? {}) as {
    pageId?: string;
    sectionId?: string;
    notebookId?: string;
    title?: string;
    autoFocus?: boolean;
  };
  const pageId = params.pageId ?? "";
  const sectionId = params.sectionId ?? "";
  const routeNotebookId = params.notebookId;
  const titleParam = params.title;
  const shouldAutoFocus = Boolean(params.autoFocus);

  const { colors } = useTheme();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const notebookId = routeNotebookId ?? notebooks?.find((nb) => (nb.sections ?? []).some((s) => s.id === sectionId))?.id;
  const password = (sectionId ? unlock.sectionPasswords[sectionId] : undefined) ?? (notebookId ? unlock.notebookPasswords[notebookId] : undefined);
  const { stackBottomClearance, insets } = useLayout();

  const [text, setText] = useState<string | null>(null);
  const [wasRich, setWasRich] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "queued">("saved");
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [actionsMenuVisible, setActionsMenuVisible] = useState(false);
  const [prompt, setPrompt] = useState<"rename" | "lock" | "remove-lock" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const skipSave = useRef(false);
  const [focus, setFocus] = useState(false);
  const [templatesDismissed, setTemplatesDismissed] = useState(false);
  const [positionReady, setPositionReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingText = useRef<string | null>(null);
  const posTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef<{ start: number; end: number } | undefined>(undefined);
  const textRef = useRef<string | null>(null);
  const scrollOffsetRef = useRef(0);
  const restoredScrollRef = useRef(false);

  const { data: page, error, isLoading, refetch } = useQuery({
    queryKey: ["page", pageId, password ?? null],
    queryFn: () => (pageId ? fetchPage(pageId, password) : Promise.reject(new Error("No page ID"))),
    enabled: Boolean(pageId),
  });
  const sectionMeta = (notebooks ?? []).flatMap((nb) => nb.sections ?? []).find((s) => s.id === sectionId);
  const sectionLocked = Boolean(sectionMeta?.isLocked);

  useEffect(() => {
    if (sectionId && notebookId) {
      rememberSection(sectionId, sectionMeta?.title ?? "", notebookId, titleParam ?? "");
    }
  }, [sectionId, notebookId, sectionMeta?.title, titleParam]);

  useEffect(() => {
    if (page && text === null) {
      const body = contentToText(page.content);
      setText(body);
      textRef.current = body;
      setWasRich(isRichContent(page.content));
      restoredScrollRef.current = false;
      if (pageId) {
        void loadPagePosition(pageId)
          .then((pos) => {
            if (pos) {
              scrollOffsetRef.current = pos.scrollOffset ?? 0;
            } else {
              scrollOffsetRef.current = 0;
            }
          })
          .catch(() => {
            scrollOffsetRef.current = 0;
          })
          .finally(() => {
            setPositionReady(true);
          });
      } else {
        setPositionReady(true);
      }
    }
  }, [page, text, pageId]);

  // Remember where the user is so the floating "+" can target this section.
  useEffect(() => {
    if (page?.section?.id) {
      rememberSection(
        page.section.id,
        page.section.title,
        page.section.notebookId,
        (page.section as any)?.notebook?.title
      );
    }
  }, [page]);

  const editorScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!positionReady) return;
    if (!shouldAutoFocus) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [positionReady, shouldAutoFocus]);

  // Restore scroll position once the ScrollView has laid out.
  useEffect(() => {
    if (!positionReady || restoredScrollRef.current) return;
    const y = scrollOffsetRef.current;
    if (y <= 0) {
      restoredScrollRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      editorScrollRef.current?.scrollTo({
        y,
        animated: false,
      });
      restoredScrollRef.current = true;
    }, 80);
    return () => clearTimeout(t);
  }, [positionReady, pageId]);

  const [pageTitle, setPageTitle] = useState(titleParam ?? "");
  const [slashMenuManual, setSlashMenuManual] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (page?.title && !pageTitle) {
      setPageTitle(page.title);
    }
  }, [page?.title]);

  function onTitleChange(next: string) {
    setPageTitle(next);
    navigation.setParams({ title: next });
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      if (next.trim()) {
        try {
          await renamePage(pageId, next.trim());
          void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
          void queryClient.invalidateQueries({ queryKey: ["page", pageId] });
        } catch {}
      }
    }, 800);
  }

  function insertFormatting(prefix: string, suffix = "") {
    if (text == null) return;
    const sel = selectionRef.current ?? { start: text.length, end: text.length };
    const before = text.slice(0, sel.start);
    const selected = text.slice(sel.start, sel.end);
    const after = text.slice(sel.end);

    let next = "";
    if (selected) {
      next = `${before}${prefix}${selected}${suffix}${after}`;
    } else {
      if (prefix.endsWith(" ") && !suffix) {
        const lastNewline = before.lastIndexOf("\n");
        const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
        const linePrefix = text.slice(0, lineStart);
        const lineContent = text.slice(lineStart);
        next = `${linePrefix}${prefix}${lineContent}`;
      } else {
        next = `${before}${prefix}${suffix}${after}`;
      }
    }
    onChangeText(next);
  }

  const slashMatch = (() => {
    if (text == null) return null;
    const sel = selectionRef.current?.start ?? text.length;
    const textUpToCursor = text.slice(0, sel);
    const match = textUpToCursor.match(/(?:^|\n)\/([a-zA-Z0-9_-]*)$/);
    if (!match) return null;
    return {
      query: match[1].toLowerCase(),
      replaceStart: textUpToCursor.length - match[0].length + (match[0].startsWith("\n") ? 1 : 0),
      replaceEnd: textUpToCursor.length,
    };
  })();

  const isSlashActive = slashMatch !== null || slashMenuManual;
  const filteredCommands = useMemo(() => {
    if (!slashMatch?.query) return NOTEBOOK_COMMANDS;
    const q = slashMatch.query;
    return NOTEBOOK_COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.id.includes(q) ||
        c.desc.toLowerCase().includes(q)
    );
  }, [slashMatch?.query]);

  function executeCommand(cmd: NotebookCommand) {
    if (text == null) return;
    if (slashMatch) {
      const before = text.slice(0, slashMatch.replaceStart);
      const after = text.slice(slashMatch.replaceEnd);
      const next = `${before}${cmd.prefix}${cmd.suffix ?? ""}${after}`;
      onChangeText(next);
    } else {
      insertFormatting(cmd.prefix, cmd.suffix);
    }
    setSlashMenuManual(false);
  }

  const saveNow = useCallback(async () => {
    if (pendingText.current === null) return;
    const body = pendingText.current;
    pendingText.current = null;
    setSaveState("saving");

    let payload = body;
    try {
      if (page?.content && isRichContent(page.content)) {
        const parsed = JSON.parse(page.content);
        if (Array.isArray(parsed)) {
          const mediaBlocks = parsed.filter((b) => b.type === "image" || b.type === "annotation");
          payload = textToBlockNoteJson(body, mediaBlocks);
        } else {
          payload = textToBlockNoteJson(body);
        }
      } else {
        payload = textToBlockNoteJson(body);
      }
    } catch {
      payload = body;
    }

    try {
      await savePageContent(pageId, payload, password);
      setSaveState("saved");
      void queryClient.invalidateQueries({ queryKey: ["backlinks"] });
      void queryClient.invalidateQueries({ queryKey: ["outlinks"] });
      if (notebookId) void queryClient.invalidateQueries({ queryKey: ["graph", notebookId] });
    } catch (err: any) {
      setSaveState(err.queued ? "queued" : "error");
    }
  }, [pageId, password, queryClient, notebookId, page?.content]);

  useEffect(() => {
    if (!password && sectionLocked) {
      setText(null);
      textRef.current = null;
    }
  }, [password, sectionLocked]);

  function onChangeText(next: string) {
    unlock.recordActivity?.();
    setText(next);
    textRef.current = next;
    pendingText.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 800);
  }

  const wikiQuery = (() => {
    if (text == null) return null;
    const match = text.match(/\[\[([^\]\n]*)$/);
    if (!match) return null;
    return match[1].toLowerCase();
  })();

  const wikiSuggestions =
    wikiQuery === null
      ? []
      : (notebooks ?? [])
          .filter((nb) => nb.id === notebookId)
          .flatMap((nb) => nb.sections ?? [])
          .flatMap((sec) => sec.pages ?? [])
          .filter((p) => p?.id !== pageId && (p?.title?.toLowerCase() ?? "").includes(wikiQuery))
          .slice(0, 6);

  function insertWikiLink(title: string) {
    if (text == null) return;
    const next = text.replace(/\[\[[^\]\n]*$/, `[[${title}]] `);
    onChangeText(next);
  }

  async function exportPage() {
    if (text == null) return;
    try {
      await Share.share({ message: text, title: page?.title ?? "Page" });
    } catch {
      // user cancelled
    }
  }

  // Flush pending edits + caret when leaving the screen.
  useEffect(() => {
    return () => {
      if (skipSave.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (posTimer.current) clearTimeout(posTimer.current);
      void saveNow();
      const sel = selectionRef.current;
      if (sel) {
        void savePagePosition(pageId, { selection: sel.start, scrollOffset: scrollOffsetRef.current });
      }
    };
  }, [saveNow, pageId]);

  useEffect(() => {
    navigation.setOptions({
      headerShown: !focus,
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text
            numberOfLines={1}
            style={{
              color: saveState === "error" ? colors.danger : colors.textSecondary,
              fontSize: 11,
            }}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "queued"
                ? "Offline"
                : saveState === "error"
                  ? "Error"
                  : ""}
          </Text>
          <Pressable onPress={() => setFocus(true)} hitSlop={8} accessibilityLabel="Focus mode">
            <Feather name="maximize-2" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setActionsMenuVisible(true)}
            hitSlop={8}
            accessibilityLabel="Page options"
          >
            <Feather name="more-vertical" size={17} color={colors.textSecondary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, saveState, colors, focus]);

  const status = (error as any)?.response?.status;
  if (status === 423 || status === 401) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface0 }]}>
        <VaultSeal color={colors.accent} background={colors.accentSoft} />
        <Text style={{ color: colors.textPrimary, marginTop: 18, fontSize: 15, fontWeight: "500" }}>
          This section is sealed
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 4, marginBottom: 18, fontSize: 13 }}>
          Only your password can open it.
        </Text>
        <Pressable
          style={[styles.unlockBtn, { backgroundColor: colors.accentSoft }]}
          onPress={() => setUnlockVisible(true)}
        >
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "500" }}>Unlock</Text>
        </Pressable>
        <Pressable
          style={[styles.unlockBtn, { backgroundColor: "transparent" }]}
          onPress={() => setPrompt("remove-lock")}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Remove password</Text>
        </Pressable>
        <View style={[styles.badge, { borderColor: colors.border }]}>
          <Feather name="shield" size={11} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>AES-256-GCM · encrypted at rest</Text>
        </View>
        <PromptModal
          visible={unlockVisible}
          title="Unlock section"
          placeholder="Password"
          secure
          submitLabel="Unlock"
          onClose={() => setUnlockVisible(false)}
          onSubmit={async (pw) => {
            try {
              await unlockSection(sectionId, pw);
              unlock.setSectionPassword(sectionId, pw);
              if (notebookId) {
                unlock.unlockNotebook(notebookId, [sectionId], pw);
              }
              return null;
            } catch (err: any) {
              return err.response?.data?.error ?? "Incorrect password";
            }
          }}
        />
        <PromptModal
          visible={prompt === "remove-lock"}
          title="Remove password from this section"
          placeholder="Password"
          secure
          submitLabel="Remove"
          onClose={() => setPrompt(null)}
          onSubmit={async (pw) => {
            try {
              await removeSectionLock(sectionId, pw);
              unlock.relockSection(sectionId);
              void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
              void queryClient.invalidateQueries({ queryKey: ["page", pageId] });
              return null;
            } catch (err: any) {
              return err.response?.data?.error ?? "Couldn't remove password";
            }
          }}
        />
      </View>
    );
  }

  if (error && status !== 423 && status !== 401) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface0, padding: 24 }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 16 }}>
          Couldn't load this page.
        </Text>
        <Pressable
          style={[styles.unlockBtn, { backgroundColor: colors.accentSoft }]}
          onPress={() => void refetch()}
        >
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "500" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading || text === null || !positionReady) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface0 }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const showTemplates = !templatesDismissed && !page?.content && (text?.trim() ?? "") === "";

  const mediaSegments = useMemo(() => {
    try {
      const all = extractPageSegments(page?.content ?? "");
      return (all || []).filter((s) => s && s.type !== "text");
    } catch {
      return [];
    }
  }, [page?.content]);

  return (
    <KeyboardSafe disableAndroidPadding style={{ flex: 1, backgroundColor: colors.surface0 }}>
      {showTemplates && !focus && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.templateRow}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginRight: 4 }}>Start with</Text>
          {PAGE_TEMPLATES.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.templateChip, { borderColor: colors.border }]}
              onPress={() => {
                onChangeText(t.text);
                setTemplatesDismissed(true);
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t.name}</Text>
            </Pressable>
          ))}
          <Pressable style={{ paddingVertical: 5, paddingHorizontal: 6 }} onPress={() => setTemplatesDismissed(true)}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Blank</Text>
          </Pressable>
        </ScrollView>
      )}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={editorScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: Math.max(stackBottomClearance(false), insets.bottom, 48),
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          decelerationRate="normal"
          scrollEventThrottle={16}
          bounces={true}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            scrollOffsetRef.current = y;
            const sel = selectionRef.current;
            if (!sel) return;
            if (posTimer.current) clearTimeout(posTimer.current);
            posTimer.current = setTimeout(() => {
              void savePagePosition(pageId, { selection: sel.start, scrollOffset: y });
            }, 250);
          }}
        >
          {/* Editable Page Title */}
          {!focus && (
            <View style={styles.titleWrap}>
              <TextInput
                value={pageTitle}
                onChangeText={onTitleChange}
                placeholder="Page title"
                placeholderTextColor={colors.textSecondary}
                style={[styles.titleInput, { color: colors.textPrimary }]}
              />
            </View>
          )}

          {mediaSegments.map((seg) => {
            if (seg.type === "image") {
              const uri = resolveMediaUrl(seg.url);
              if (!uri) return null;
              return (
                <View key={seg.id} style={[styles.imageBlockWrapper, { borderColor: colors.border }]}>
                  <Image source={{ uri }} style={styles.imageBlock} resizeMode="cover" />
                  {seg.caption ? (
                    <Text style={[styles.imageCaption, { color: colors.textSecondary }]}>
                      {seg.caption}
                    </Text>
                  ) : null}
                </View>
              );
            }
            if (seg.type === "annotation") {
              return (
                <View
                  key={seg.id}
                  style={[
                    styles.annotationBlockWrapper,
                    { borderColor: colors.border, backgroundColor: colors.surface1 },
                  ]}
                >
                  <View style={styles.annotationHeader}>
                    <Feather name="edit-3" size={13} color={colors.accent} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500", marginLeft: 6 }}>
                      Handwritten Annotation {seg.caption ? `· ${seg.caption}` : ""}
                    </Text>
                  </View>
                </View>
              );
            }
            return null;
          })}

          <TextInput
            ref={inputRef}
            style={[
              styles.editor,
              { color: colors.textPrimary, flex: 1, minHeight: 320 },
              focus && styles.focusEditor,
            ]}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            value={text ?? ""}
            onChangeText={onChangeText}
            onSelectionChange={(e) => {
              const next = e.nativeEvent.selection;
              selectionRef.current = next;
              if (posTimer.current) clearTimeout(posTimer.current);
              posTimer.current = setTimeout(() => {
                if (pageId) void savePagePosition(pageId, { selection: next.start, scrollOffset: scrollOffsetRef.current });
              }, 250);
            }}
            placeholder="Type / for commands, or write freely…"
            placeholderTextColor={colors.textSecondary}
          />
        </ScrollView>

        {/* Wiki Link Autocomplete */}
        {wikiSuggestions.length > 0 && (
          <GlassCard style={styles.wikiMenu} contentStyle={{ paddingVertical: 6, maxHeight: 220 }}>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {wikiSuggestions.map((p) => (
                <Pressable key={p.id} style={styles.wikiItem} onPress={() => insertWikiLink(p.title)}>
                  <Feather name="link" size={13} color={colors.accent} />
                  <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, minWidth: 0 }} numberOfLines={1}>
                    {p.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </GlassCard>
        )}

        {/* Slash Command Suggestions / Picker */}
        {isSlashActive && (
          <GlassCard style={styles.slashMenu} contentStyle={{ paddingVertical: 6, maxHeight: 260 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 }}>
              <Text style={[styles.slashMenuHeader, { color: colors.textSecondary, paddingHorizontal: 0, paddingVertical: 0 }]}>
                COMMANDS & BLOCKS
              </Text>
              {slashMenuManual && (
                <Pressable onPress={() => setSlashMenuManual(false)} hitSlop={6}>
                  <Feather name="x" size={14} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {filteredCommands.map((cmd) => (
                <Pressable
                  key={cmd.id}
                  style={styles.slashMenuItem}
                  onPress={() => executeCommand(cmd)}
                >
                  <View style={[styles.slashIconBox, { backgroundColor: colors.surface2 }]}>
                    <Feather name={cmd.icon} size={14} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
                      {cmd.label}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      {cmd.desc}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </GlassCard>
        )}

        {/* Bottom Quick-Formatting & Command Toolbar */}
        {!focus && (
          <View style={[styles.formatBar, { backgroundColor: colors.surface1, borderColor: colors.glassBorder }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 4, paddingHorizontal: 12, alignItems: "center" }}
            >
              <Pressable style={styles.formatBtn} onPress={() => setSlashMenuManual((v) => !v)} hitSlop={6}>
                <Text style={[styles.formatBtnSlash, { color: colors.accent }]}>/</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent, marginLeft: 2 }}>Commands</Text>
              </Pressable>
              <View style={[styles.formatDivider, { backgroundColor: colors.glassBorder }]} />
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("# ")} hitSlop={6}>
                <Text style={[styles.formatBtnText, { color: colors.textPrimary }]}>H1</Text>
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("## ")} hitSlop={6}>
                <Text style={[styles.formatBtnText, { color: colors.textPrimary }]}>H2</Text>
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("### ")} hitSlop={6}>
                <Text style={[styles.formatBtnText, { color: colors.textPrimary }]}>H3</Text>
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("**", "**")} hitSlop={6}>
                <Feather name="bold" size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("*", "*")} hitSlop={6}>
                <Feather name="italic" size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("- [ ] ")} hitSlop={6}>
                <Feather name="check-square" size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("- ")} hitSlop={6}>
                <Feather name="list" size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("> ")} hitSlop={6}>
                <Feather name="message-square" size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("`", "`")} hitSlop={6}>
                <Feather name="code" size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.formatBtn} onPress={() => insertFormatting("[[")} hitSlop={6}>
                <Feather name="link-2" size={14} color={colors.textSecondary} />
              </Pressable>
            </ScrollView>
          </View>
        )}
      </View>
      {focus && (
        <View pointerEvents="none" style={[styles.focusTitle, { paddingTop: 12 }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
            {pageTitle || page?.title || "Page"}
          </Text>
        </View>
      )}
      {focus && (
        <Pressable onPress={() => setFocus(false)} style={styles.exitFocusWrap}>
          <GlassCard style={{ borderRadius: 999 }} contentStyle={styles.exitFocus}>
            <Feather name="minimize-2" size={15} color={colors.textSecondary} />
          </GlassCard>
        </Pressable>
      )}
      <ConfirmModal
        visible={confirmDelete}
        title="Move to recycle bin?"
        message={`Move “${pageTitle || page?.title || "this page"}” to the recycle bin? You can restore it within 7 days.`}
        confirmLabel="Move"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          skipSave.current = true;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          pendingText.current = null;
          await deletePage(pageId);
          void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
          navigation.goBack();
        }}
      />
      <PromptModal
        visible={prompt === "rename"}
        title="Rename page"
        placeholder="Title"
        submitLabel="Save"
        initialValue={pageTitle || page?.title || ""}
        onClose={() => setPrompt(null)}
        onSubmit={async (value) => {
          try {
            await renamePage(pageId, value);
            setPageTitle(value);
            navigation.setParams({ title: value });
            void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            void queryClient.invalidateQueries({ queryKey: ["page", pageId] });
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Couldn't rename page";
          }
        }}
      />
      <PromptModal
        visible={prompt === "lock"}
        title="Lock this section"
        placeholder="Password"
        secure
        submitLabel="Lock"
        onClose={() => setPrompt(null)}
        onSubmit={async (pw) => {
          if (pw.length < 8) return "Password must be at least 8 characters";
          try {
            await lockSection(sectionId, pw);
            unlock.setSectionPassword(sectionId, pw);
            void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Couldn't lock section";
          }
        }}
      />
      <PromptModal
        visible={prompt === "remove-lock"}
        title="Remove password from this section"
        placeholder="Password"
        secure
        submitLabel="Remove"
        onClose={() => setPrompt(null)}
        onSubmit={async (pw) => {
          try {
            await removeSectionLock(sectionId, pw);
            unlock.relockSection(sectionId);
            void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Couldn't remove password";
          }
        }}
      />
      <Modal
        visible={actionsMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionsMenuVisible(false)}
      >
        <Pressable
          style={styles.actionModalBackdrop}
          onPress={() => setActionsMenuVisible(false)}
        >
          <GlassCard style={styles.actionModalCard}>
            <Text style={[styles.actionModalTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {pageTitle || page?.title || "Page options"}
            </Text>

            <Pressable
              style={styles.actionModalItem}
              onPress={() => {
                setActionsMenuVisible(false);
                void exportPage();
              }}
            >
              <Feather name="share-2" size={18} color={colors.accent} />
              <Text style={[styles.actionModalItemText, { color: colors.textPrimary }]}>
                Share / Export page
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionModalItem}
              onPress={() => {
                setActionsMenuVisible(false);
                setTemplatesOpen(true);
              }}
            >
              <Feather name="layout" size={18} color={colors.textSecondary} />
              <Text style={[styles.actionModalItemText, { color: colors.textPrimary }]}>
                Apply template
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionModalItem}
              onPress={() => {
                setActionsMenuVisible(false);
                setPrompt("rename");
              }}
            >
              <Feather name="edit-2" size={18} color={colors.textSecondary} />
              <Text style={[styles.actionModalItemText, { color: colors.textPrimary }]}>
                Rename page
              </Text>
            </Pressable>

            {!sectionLocked ? (
              <Pressable
                style={styles.actionModalItem}
                onPress={() => {
                  setActionsMenuVisible(false);
                  setPrompt("lock");
                }}
              >
                <Feather name="unlock" size={18} color={colors.textSecondary} />
                <Text style={[styles.actionModalItemText, { color: colors.textPrimary }]}>
                  Lock section
                </Text>
              </Pressable>
            ) : password ? (
              <Pressable
                style={styles.actionModalItem}
                onPress={() => {
                  setActionsMenuVisible(false);
                  setPrompt("remove-lock");
                }}
              >
                <Feather name="shield-off" size={18} color={colors.textSecondary} />
                <Text style={[styles.actionModalItemText, { color: colors.textPrimary }]}>
                  Remove password
                </Text>
              </Pressable>
            ) : null}

            <View style={[styles.actionModalDivider, { backgroundColor: colors.glassBorder }]} />

            <Pressable
              style={styles.actionModalItem}
              onPress={() => {
                setActionsMenuVisible(false);
                setConfirmDelete(true);
              }}
            >
              <Feather name="trash-2" size={18} color={colors.danger} />
              <Text style={[styles.actionModalItemText, { color: colors.danger }]}>
                Delete page
              </Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      </Modal>

      {/* Templates Modal */}
      <Modal
        visible={templatesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplatesOpen(false)}
      >
        <Pressable
          style={styles.actionModalBackdrop}
          onPress={() => setTemplatesOpen(false)}
        >
          <GlassCard style={styles.actionModalCard}>
            <Text style={[styles.actionModalTitle, { color: colors.textSecondary }]}>
              Choose a template
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {PAGE_TEMPLATES.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.actionModalItem}
                  onPress={() => {
                    onChangeText((text ? `${text}\n\n` : "") + t.text);
                    setTemplatesOpen(false);
                  }}
                >
                  <Feather name="file-text" size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionModalItemText, { color: colors.textPrimary }]}>
                      {t.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </GlassCard>
        </Pressable>
      </Modal>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notice: { fontSize: 11, paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  titleWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    padding: 0,
  },
  editor: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, fontSize: 15, lineHeight: 22 },
  focusEditor: { paddingTop: 64, fontSize: 16, lineHeight: 26, paddingHorizontal: 24 },
  focusTitle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 40,
  },
  exitFocusWrap: {
    position: "absolute",
    bottom: 24,
    right: 20,
  },
  exitFocus: {
    padding: 11,
  },
  formatBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  formatBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  formatBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  formatBtnSlash: {
    fontSize: 14,
    fontWeight: "700",
  },
  formatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    marginHorizontal: 3,
  },
  slashMenu: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 54,
    borderRadius: 16,
    zIndex: 100,
  },
  slashMenuHeader: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
  },
  slashMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  slashIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  wikiMenu: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 54,
  },
  wikiItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  templateRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10 },
  templateChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sealRing: { position: "absolute", height: 64, width: 64, borderRadius: 20 },
  sealBox: { height: 64, width: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  unlockBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 9, marginBottom: 18 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: 16,
    paddingBottom: 32,
  },
  actionModalCard: {
    padding: 18,
    borderRadius: 20,
    gap: 4,
  },
  actionModalTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  actionModalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  actionModalItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  actionModalDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  imageBlockWrapper: {
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  imageBlock: {
    width: "100%",
    height: 220,
  },
  imageCaption: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: "center",
  },
  annotationBlockWrapper: {
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  annotationHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
});
