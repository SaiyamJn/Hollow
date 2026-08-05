import { Platform, Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../contexts/theme";
import { TAB_BAR_HEIGHT, useLayout } from "../lib/layout";

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Notebooks: "book",
  "Quick notes": "file-text",
  Tasks: "check-square",
  Links: "share-2",
};

/** Minimal floating pill — evenly spaced, centered icons, pill-shaped active state. */
export function HollowTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme, colors } = useTheme();
  const { tabBarBottom, tabBarMarginH, isNarrow } = useLayout();
  const iconSize = isNarrow ? 18 : 20;

  const visible = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => route.name !== "Home");

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: tabBarBottom,
          left: tabBarMarginH,
          right: tabBarMarginH,
          height: TAB_BAR_HEIGHT,
          borderRadius: TAB_BAR_HEIGHT / 2,
          borderColor: colors.glassBorder,
          backgroundColor:
            Platform.OS === "android"
              ? theme === "dark"
                ? "rgba(22, 24, 27, 0.92)"
                : "rgba(255, 255, 255, 0.92)"
              : "transparent",
        },
      ]}
    >
      {Platform.OS === "ios" && (
        <BlurView
          intensity={50}
          tint={theme === "dark" ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
        />
      )}

      <View style={styles.row}>
        {visible.map(({ route, index }) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const color = focused ? colors.accent : colors.textSecondary;
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
              onPress={onPress}
              // Kill Android square ripple — selection is the soft pill fill only.
              android_ripple={{ color: "transparent" }}
              style={styles.item}
              hitSlop={8}
            >
              <View
                style={[
                  styles.iconPill,
                  focused && {
                    backgroundColor: colors.accentSoft,
                  },
                ]}
              >
                <View style={styles.iconSlot}>
                  <Feather name={TAB_ICONS[route.name] ?? "circle"} size={iconSize} color={color} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 8,
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  /** Capsule active indicator — full pill, never a square. */
  iconPill: {
    height: 34,
    minWidth: 56,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Fixed box so Feather glyphs share one optical center. */
  iconSlot: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
