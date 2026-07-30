import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../contexts/theme";
import { GlassCard } from "./GlassCard";

export interface FabAction {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}

// Floating "+" button. One action fires directly; multiple actions open a
// small stacked menu above the button.
export function Fab({ actions, bottom = 100 }: { actions: FabAction[]; bottom?: number }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  function onPress() {
    if (actions.length === 1) actions[0].onPress();
    else setOpen(true);
  }

  return (
    <>
      <Pressable
        style={[styles.fab, { bottom, backgroundColor: colors.accent }]}
        onPress={onPress}
        accessibilityLabel="Add"
      >
        <Feather name="plus" size={22} color={colors.surface0} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { bottom: bottom + 62 }]}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => {
                  setOpen(false);
                  action.onPress();
                }}
              >
                <GlassCard style={{ borderRadius: 999 }} contentStyle={styles.menuItem}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{action.label}</Text>
                  <View style={[styles.menuIcon, { backgroundColor: colors.accentSoft }]}>
                    <Feather name={action.icon} size={15} color={colors.accent} />
                  </View>
                </GlassCard>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    height: 52,
    width: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  menu: { position: "absolute", right: 20, gap: 8, alignItems: "flex-end" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  menuIcon: { height: 30, width: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
