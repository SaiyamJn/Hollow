import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { fetchBacklinks, fetchNotebooks, fetchOutlinks } from "../lib/api";
import type { Section } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { GlassCard } from "../components/GlassCard";
import { useLayout } from "../lib/layout";

// Simplified backlinks list (vs web graph): pick a notebook, expand a page,
// see what it links to and what links here. Create links by typing [[Title]]
// in a page editor — they resolve on save within the same notebook.
export default function LinksScreen({ navigation }: any) {
  const { colors } = useTheme();
  const unlock = useUnlock();
  const { screenPad, listBottomClearance } = useLayout();
  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);

  const active = notebooks?.find((nb) => nb.id === activeNotebookId) ?? notebooks?.[0];
  const visibleSections = (active?.sections ?? []).filter(
    (sec) => !sec.isLocked || unlock.sectionPasswords[sec.id]
  );

  function openPage(pageId: string, sectionId: string, title: string) {
    if (!active) return;
    navigation.navigate("Page", {
      pageId,
      sectionId,
      notebookId: active.id,
      title,
    });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface0 }}
      contentContainerStyle={{ padding: screenPad, paddingBottom: listBottomClearance(false) }}
    >
      <View style={{ marginBottom: 10, alignItems: "center" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>
          Type [[Page Title]] in a note to connect pages.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 14, justifyContent: "center" }}
      >
        {(notebooks ?? []).map((nb) => {
          const selected = nb.id === active?.id;
          return (
            <GlassCard
              key={nb.id}
              style={{ borderRadius: 999, borderColor: selected ? colors.accent : colors.glassBorder }}
              contentStyle={styles.chip}
            >
              <Pressable
                onPress={() => {
                  setActiveNotebookId(nb.id);
                  setExpandedPageId(null);
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.textPrimary : colors.textSecondary,
                    fontSize: 13,
                    maxWidth: 160,
                  }}
                  numberOfLines={1}
                >
                  {nb.title}
                </Text>
              </Pressable>
            </GlassCard>
          );
        })}
      </ScrollView>

      {visibleSections.map((section) => (
        <SectionLinks
          key={section.id}
          section={section}
          expandedPageId={expandedPageId}
          onToggle={(id) => setExpandedPageId((cur) => (cur === id ? null : id))}
          onOpenPage={(pageId, title) => openPage(pageId, section.id, title)}
          onOpenLinked={(pageId, sectionId, title) => openPage(pageId, sectionId, title)}
        />
      ))}

      {visibleSections.every((s) => s.pages.length === 0) && (
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 24 }}>
          No pages to link yet — create a page, then type [[Another Page]].
        </Text>
      )}
    </ScrollView>
  );
}

function SectionLinks({
  section,
  expandedPageId,
  onToggle,
  onOpenPage,
  onOpenLinked,
}: {
  section: Section;
  expandedPageId: string | null;
  onToggle: (pageId: string) => void;
  onOpenPage: (pageId: string, title: string) => void;
  onOpenLinked: (pageId: string, sectionId: string, title: string) => void;
}) {
  const { colors } = useTheme();
  if (section.pages.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{section.title.toUpperCase()}</Text>
      {section.pages.map((page) => (
        <GlassCard key={page.id} style={{ marginBottom: 8 }} contentStyle={styles.pageCard}>
          <Pressable style={styles.pageRow} onPress={() => onToggle(page.id)}>
            <Feather
              name={expandedPageId === page.id ? "chevron-down" : "chevron-right"}
              size={15}
              color={colors.textSecondary}
            />
            <Text
              style={{ color: colors.textPrimary, fontSize: 14, flex: 1, minWidth: 0, textAlign: "left" }}
              numberOfLines={1}
            >
              {page.title}
            </Text>
            <Pressable onPress={() => onOpenPage(page.id, page.title)} hitSlop={8}>
              <Feather name="arrow-up-right" size={15} color={colors.accent} />
            </Pressable>
          </Pressable>
          {expandedPageId === page.id && (
            <PageConnections pageId={page.id} onOpen={onOpenLinked} />
          )}
        </GlassCard>
      ))}
    </View>
  );
}

function PageConnections({
  pageId,
  onOpen,
}: {
  pageId: string;
  onOpen: (pageId: string, sectionId: string, title: string) => void;
}) {
  const { colors } = useTheme();
  const { data: backlinks, isLoading: loadingIn } = useQuery({
    queryKey: ["backlinks", pageId],
    queryFn: () => fetchBacklinks(pageId),
  });
  const { data: outlinks, isLoading: loadingOut } = useQuery({
    queryKey: ["outlinks", pageId],
    queryFn: () => fetchOutlinks(pageId),
  });

  const loading = loadingIn || loadingOut;

  return (
    <View style={[styles.backlinks, { borderTopColor: colors.border }]}>
      {loading ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "center" }}>Loading…</Text>
      ) : (
        <>
          <Text style={[styles.connLabel, { color: colors.textSecondary }]}>LINKS TO</Text>
          {(outlinks ?? []).length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "center" }}>
              None yet — type [[Title]] in this page.
            </Text>
          ) : (
            (outlinks ?? []).map((ol) => (
              <Pressable
                key={ol.id}
                style={styles.backlinkRow}
                onPress={() => onOpen(ol.id, ol.sectionId, ol.title)}
              >
                <Feather name="arrow-right" size={12} color={colors.textSecondary} />
                <Text style={{ color: colors.accent, fontSize: 13, flex: 1, minWidth: 0 }} numberOfLines={1}>
                  {ol.title}
                </Text>
              </Pressable>
            ))
          )}
          <Text style={[styles.connLabel, { color: colors.textSecondary, marginTop: 10 }]}>LINKED FROM</Text>
          {(backlinks ?? []).length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "center" }}>
              No pages link here.
            </Text>
          ) : (
            (backlinks ?? []).map((bl) => (
              <Pressable
                key={bl.id}
                style={styles.backlinkRow}
                onPress={() => onOpen(bl.id, bl.sectionId, bl.title)}
              >
                <Feather name="corner-down-right" size={12} color={colors.textSecondary} />
                <Text style={{ color: colors.accent, fontSize: 13, flex: 1, minWidth: 0 }} numberOfLines={1}>
                  {bl.title}
                </Text>
              </Pressable>
            ))
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7 },
  sectionHeader: { fontSize: 11, fontWeight: "500", letterSpacing: 0.8, marginBottom: 8, textAlign: "center" },
  pageCard: { paddingHorizontal: 12 },
  pageRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11 },
  backlinks: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 8 },
  backlinkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  connLabel: { fontSize: 10, fontWeight: "500", letterSpacing: 0.7, textAlign: "center" },
});
