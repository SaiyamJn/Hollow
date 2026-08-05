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

/** Floating glass pill — only the four visible tabs, evenly spaced (Home is hidden). */
export function HollowTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme, colors } = useTheme();
  const { tabBarBottom, tabBarMarginH, isNarrow } = useLayout();

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
        },
      ]}
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={55}
          tint={theme === "dark" ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
        />
      ) : (
        <BlurView
          intensity={40}
          tint={theme === "dark" ? "dark" : "light"}
          experimentalBlurMethod="dimezisBlurView"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                theme === "dark" ? "rgba(22, 24, 27, 0.72)" : "rgba(255, 255, 255, 0.72)",
            },
          ]}
        />
      )}
      {/* Soft top highlight for glass edge */}
      <View
        pointerEvents="none"
        style={[
          styles.sheen,
          {
            backgroundColor:
              theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.45)",
          },
        ]}
      />

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
              style={styles.item}
              hitSlop={6}
            >
              <View style={[styles.iconHit, focused && { backgroundColor: colors.accentSoft }]}>
                <Feather
                  name={TAB_ICONS[route.name] ?? "circle"}
                  size={isNarrow ? 18 : 20}
                  color={color}
                />
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
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "45%",
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 4,
    // Feather glyphs sit optically high — nudge the row down into the pill center.
    paddingTop: 3,
    paddingBottom: 1,
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iconHit: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    // Extra optical center for vector icons inside the hit target.
    paddingTop: 2,
  },
});
