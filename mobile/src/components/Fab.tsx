import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../contexts/theme";
import { useLayout, FAB_SIZE } from "../lib/layout";
import { GlassCard } from "./GlassCard";

export interface FabAction {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}

// Floating "+" button. One action fires directly; multiple actions open a
// small stacked menu above the button.
export function Fab({
  actions,
  bottom,
}: {
  actions: FabAction[];
  /** Override bottom offset; defaults to above the floating tab bar. */
  bottom?: number;
}) {
  const { colors } = useTheme();
  const { fabBottom, isNarrow } = useLayout();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const resolvedBottom = bottom ?? fabBottom;
  const size = isNarrow ? 48 : FAB_SIZE;
  const menuMaxWidth = Math.max(160, width - 48);

  if (actions.length === 0) return null;

  function onPress() {
    if (actions.length === 1) actions[0].onPress();
    else setOpen(true);
  }

  function runAction(action: FabAction) {
    setOpen(false);
    // Defer so the modal fully dismisses before navigation / another modal opens.
    // Nested Pressable + Modal close was swallowing "New list" taps.
    setTimeout(() => action.onPress(), 80);
  }

  return (
    <>
      <Pressable
        style={[
          styles.fab,
          {
            bottom: resolvedBottom,
            right: isNarrow ? 14 : 20,
            height: size,
            width: size,
            borderRadius: size / 2,
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            shadowOpacity: 0.4,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
            borderWidth: 3,
            borderColor: colors.accentSoft,
          },
        ]}
        onPress={onPress}
        accessibilityLabel="Add"
      >
        <Feather name="plus" size={isNarrow ? 20 : 22} color={colors.surface0} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Dismiss" />
          <View
            style={[styles.menu, { bottom: resolvedBottom + size + 10, right: isNarrow ? 14 : 20 }]}
            pointerEvents="box-none"
          >
            {actions.map((action) => (
              <Pressable key={action.key} onPress={() => runAction(action)}>
                <GlassCard style={{ borderRadius: 999, maxWidth: menuMaxWidth }} contentStyle={styles.menuItem}>
                  <Text
                    style={{ color: colors.textPrimary, fontSize: 14, flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                  <View style={[styles.menuIcon, { backgroundColor: colors.accentSoft }]}>
                    <Feather name={action.icon} size={15} color={colors.accent} />
                  </View>
                </GlassCard>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  menu: { position: "absolute", gap: 8, alignItems: "flex-end" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  menuIcon: { height: 30, width: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
