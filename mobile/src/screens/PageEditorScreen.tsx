import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { fetchNotebooks, fetchPage, savePageContent, unlockSection } from "../lib/api";
import { contentToText, isRichContent } from "../lib/content";
import { rememberSection } from "../lib/navMemory";
import { PAGE_TEMPLATES } from "../lib/templates";
import { loadPagePosition, savePagePosition } from "../lib/pagePosition";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { PromptModal } from "../components/PromptModal";
import { GlassCard } from "../components/GlassCard";
import { KeyboardSafe } from "../components/KeyboardSafe";

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

// Plain-text editor (open implementation choice per 04-mobile-spec.md: a
// simple editor instead of a native block editor for v1). Saving from mobile
// stores plain text; the web app renders it as paragraphs.
export default function PageEditorScreen({ route, navigation }: any) {
  const { pageId, sectionId, notebookId: routeNotebookId, autoFocus: autoFocusParam } = route.params as {
    pageId: string;
    sectionId: string;
    notebookId?: string;
    autoFocus?: boolean;
  };
  const shouldAutoFocus = Boolean(autoFocusParam);
  const { colors } = useTheme();
  const unlock = useUnlock();
  const queryClient = useQueryClient();
  const password = unlock.sectionPasswords[sectionId];

  const [text, setText] = useState<string | null>(null);
  const [wasRich, setWasRich] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "queued">("saved");
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [focus, setFocus] = useState(false);
  const [templatesDismissed, setTemplatesDismissed] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>();
  const [positionReady, setPositionReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingText = useRef<string | null>(null);
  const posTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef<{ start: number; end: number } | undefined>(undefined);

  const { data: page, error, isLoading } = useQuery({
    queryKey: ["page", pageId, password ?? null],
    queryFn: () => fetchPage(pageId, password),
  });
  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const notebookId = routeNotebookId ?? page?.section.notebookId;

  useEffect(() => {
    if (page && text === null) {
      const body = contentToText(page.content);
      setText(body);
      setWasRich(isRichContent(page.content));
      void loadPagePosition(pageId).then((pos) => {
        if (pos) {
          const start = Math.min(Math.max(0, pos.selection), body.length);
          setSelection({ start, end: start });
        } else {
          // New visit — leave caret at end so long notes don't jump to the top.
          setSelection({ start: body.length, end: body.length });
        }
        setPositionReady(true);
      });
    }
  }, [page, text, pageId]);

  // Remember where the user is so the floating "+" can target this section.
  useEffect(() => {
    if (page) rememberSection(page.section.id, page.section.title, page.section.notebookId);
  }, [page]);

  useEffect(() => {
    if (!positionReady || selection == null) return;
    // Restore caret; only open the keyboard when this page was just created.
    const t = setTimeout(() => {
      if (shouldAutoFocus) inputRef.current?.focus();
      inputRef.current?.setNativeProps?.({ selection });
      setSelection(undefined);
    }, 50);
    return () => clearTimeout(t);
  }, [positionReady, pageId, shouldAutoFocus]);

  const saveNow = useCallback(async () => {
    if (pendingText.current === null) return;
    const content = pendingText.current;
    pendingText.current = null;
    setSaveState("saving");
    try {
      await savePageContent(pageId, content, password);
      setSaveState("saved");
      void queryClient.invalidateQueries({ queryKey: ["backlinks"] });
      void queryClient.invalidateQueries({ queryKey: ["outlinks"] });
      if (notebookId) void queryClient.invalidateQueries({ queryKey: ["graph", notebookId] });
    } catch (err: any) {
      setSaveState(err.queued ? "queued" : "error");
    }
  }, [pageId, password, queryClient, notebookId]);

  function onChangeText(next: string) {
    setText(next);
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
          .flatMap((nb) => nb.sections)
          .flatMap((sec) => sec.pages)
          .filter((p) => p.id !== pageId && p.title.toLowerCase().includes(wikiQuery))
          .slice(0, 6);

  function insertWikiLink(title: string) {
    if (text == null) return;
    const next = text.replace(/\[\[[^\]\n]*$/, `[[${title}]] `);
    onChangeText(next);
  }

  // Flush pending edits + caret when leaving the screen.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (posTimer.current) clearTimeout(posTimer.current);
      void saveNow();
      const sel = selectionRef.current;
      if (sel) void savePagePosition(pageId, { selection: sel.start });
    };
  }, [saveNow, pageId]);

  useEffect(() => {
    navigation.setOptions({
      headerShown: !focus,
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text
            style={{
              color: saveState === "error" ? colors.danger : colors.textSecondary,
              fontSize: 12,
            }}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "queued"
                ? "Offline — queued"
                : saveState === "error"
                  ? "Couldn't save"
                  : "Saved"}
          </Text>
          <Pressable onPress={() => setFocus(true)} hitSlop={8}>
            <Feather name="maximize-2" size={15} color={colors.textSecondary} />
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
              return null;
            } catch (err: any) {
              return err.response?.data?.error ?? "Incorrect password";
            }
          }}
        />
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

  const showTemplates = !templatesDismissed && !page?.content && text.trim() === "";

  return (
    <KeyboardSafe style={{ backgroundColor: colors.surface0 }}>
      {wasRich && !focus && (
        <Text style={[styles.notice, { color: colors.textSecondary, borderBottomColor: colors.border }]}>
          Editing as plain text — rich formatting from the web is flattened on save.
        </Text>
      )}
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
      <TextInput
        ref={inputRef}
        style={[styles.editor, { color: colors.textPrimary }, focus && styles.focusEditor]}
        multiline
        textAlignVertical="top"
        value={text}
        onChangeText={onChangeText}
        selection={selection}
        onSelectionChange={(e) => {
          const next = e.nativeEvent.selection;
          selectionRef.current = next;
          setSelection(next);
          if (posTimer.current) clearTimeout(posTimer.current);
          posTimer.current = setTimeout(() => {
            void savePagePosition(pageId, { selection: next.start });
          }, 250);
        }}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset?.y;
          const sel = selectionRef.current;
          if (typeof y !== "number" || !sel) return;
          if (posTimer.current) clearTimeout(posTimer.current);
          posTimer.current = setTimeout(() => {
            void savePagePosition(pageId, { selection: sel.start, scrollOffset: y });
          }, 250);
        }}
        placeholder="Start writing…  Type [[ to link a page"
        placeholderTextColor={colors.textSecondary}
      />
      {wikiSuggestions.length > 0 && (
        <GlassCard style={styles.wikiMenu} contentStyle={{ paddingVertical: 6 }}>
          {wikiSuggestions.map((p) => (
            <Pressable key={p.id} style={styles.wikiItem} onPress={() => insertWikiLink(p.title)}>
              <Feather name="link" size={13} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1, minWidth: 0 }} numberOfLines={1}>
                {p.title}
              </Text>
            </Pressable>
          ))}
        </GlassCard>
      )}
      {focus && (
        <Pressable onPress={() => setFocus(false)} style={styles.exitFocusWrap}>
          <GlassCard style={{ borderRadius: 999 }} contentStyle={styles.exitFocus}>
            <Feather name="minimize-2" size={15} color={colors.textSecondary} />
          </GlassCard>
        </Pressable>
      )}
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notice: { fontSize: 11, paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  editor: { flex: 1, padding: 20, fontSize: 15, lineHeight: 22 },
  focusEditor: { paddingTop: 64, fontSize: 16, lineHeight: 26, paddingHorizontal: 24 },
  exitFocusWrap: {
    position: "absolute",
    bottom: 24,
    right: 20,
  },
  exitFocus: {
    padding: 11,
  },
  wikiMenu: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
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
});
