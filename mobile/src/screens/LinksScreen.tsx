import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { fetchBacklinks, fetchNotebooks } from "../lib/api";
import type { Section } from "../lib/types";
import { useTheme } from "../contexts/theme";
import { useUnlock } from "../contexts/unlock";
import { GlassCard } from "../components/GlassCard";

// The mobile spec recommends a simplified backlinks list instead of the web's
// full graph canvas for v1: pick a notebook, expand a page, see what links to it.
export default function LinksScreen({ navigation }: any) {
  const { colors } = useTheme();
  const unlock = useUnlock();
  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);

  const active = notebooks?.find((nb) => nb.id === activeNotebookId) ?? notebooks?.[0];
  const visibleSections = (active?.sections ?? []).filter(
    (sec) => !sec.isLocked || unlock.sectionPasswords[sec.id]
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        {(notebooks ?? []).map((nb) => {
          const selected = nb.id === active?.id;
          return (
            <GlassCard
              key={nb.id}
              style={{ borderRadius: 999, borderColor: selected ? colors.accent : colors.glassBorder }}
              contentStyle={styles.chip}
            >
              <Pressable onPress={() => setActiveNotebookId(nb.id)}>
                <Text style={{ color: selected ? colors.textPrimary : colors.textSecondary, fontSize: 13 }}>{nb.title}</Text>
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
          onOpen={(pageId, title) =>
            navigation.navigate("Page", { pageId, sectionId: section.id, notebookId: section.notebookId, title })
          }
        />
      ))}

      {visibleSections.every((s) => s.pages.length === 0) && (
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 24 }}>
          No pages to link yet.
        </Text>
      )}
    </ScrollView>
  );
}

function SectionLinks({
  section,
  expandedPageId,
  onToggle,
  onOpen,
}: {
  section: Section;
  expandedPageId: string | null;
  onToggle: (pageId: string) => void;
  onOpen: (pageId: string, title: string) => void;
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
            <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }} numberOfLines={1}>
              {page.title}
            </Text>
            <Pressable onPress={() => onOpen(page.id, page.title)} hitSlop={8}>
              <Feather name="arrow-up-right" size={15} color={colors.accent} />
            </Pressable>
          </Pressable>
          {expandedPageId === page.id && <BacklinksList pageId={page.id} onOpen={onOpen} />}
        </GlassCard>
      ))}
    </View>
  );
}

function BacklinksList({ pageId, onOpen }: { pageId: string; onOpen: (pageId: string, title: string) => void }) {
  const { colors } = useTheme();
  const { data: backlinks, isLoading } = useQuery({
    queryKey: ["backlinks", pageId],
    queryFn: () => fetchBacklinks(pageId),
  });

  return (
    <View style={[styles.backlinks, { borderTopColor: colors.border }]}>
      {isLoading ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Loading…</Text>
      ) : (backlinks ?? []).length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No pages link here.</Text>
      ) : (
        (backlinks ?? []).map((bl) => (
          <Pressable key={bl.id} style={styles.backlinkRow} onPress={() => onOpen(bl.id, bl.title)}>
            <Feather name="corner-down-right" size={12} color={colors.textSecondary} />
            <Text style={{ color: colors.accent, fontSize: 13 }}>{bl.title}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7 },
  sectionHeader: { fontSize: 11, fontWeight: "500", letterSpacing: 0.8, marginBottom: 8 },
  pageCard: { paddingHorizontal: 12 },
  pageRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11 },
  backlinks: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 8 },
  backlinkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
