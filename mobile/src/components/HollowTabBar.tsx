import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../contexts/theme";
import { TAB_BAR_HEIGHT, useLayout } from "../lib/layout";

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Notebooks: "book",
  "Quick notes": "file-text",
  Calendar: "calendar",
  Tasks: "check-square",
  Links: "share-2",
};

/** Capsule size — wider than tall so it always reads as a pill, never a square. */
const PILL_H = 30;
/** Slightly narrower so five visible tabs (incl. Calendar) still read as a pill. */
const PILL_W = 48;

type Slot = { x: number; width: number };

/** Compact floating pill — sliding capsule active indicator + visible icons. */
export function HollowTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme, colors } = useTheme();
  const { tabBarBottom, tabBarMarginH, isNarrow } = useLayout();
  const iconSize = isNarrow ? 17 : 19;
  const focusedRouteKey = state.routes[state.index]?.key;

  const visible = state.routes.filter((route) => route.name !== "Home");

  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const pillX = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(0)).current;

  const focused = visible.find((r) => r.key === focusedRouteKey);
  const focusedSlot = focused ? slots[focused.key] : undefined;
  const showPill = Boolean(focusedSlot);

  useEffect(() => {
    if (!focusedSlot) {
      Animated.timing(pillOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }
    const targetX = focusedSlot.x + (focusedSlot.width - PILL_W) / 2;
    Animated.parallel([
      Animated.spring(pillX, {
        toValue: targetX,
        useNativeDriver: true,
        friction: 10,
        tension: 90,
        overshootClamping: false,
      }),
      Animated.timing(pillOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [focusedSlot?.x, focusedSlot?.width, focusedSlot, pillX, pillOpacity]);

  function onItemLayout(key: string, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    setSlots((prev) => {
      const cur = prev[key];
      if (cur && cur.x === x && cur.width === width) return prev;
      return { ...prev, [key]: { x, width } };
    });
  }

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
                ? "rgba(22, 24, 27, 0.96)"
                : "rgba(255, 255, 255, 0.96)"
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
        {showPill && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slidingPill,
              {
                opacity: pillOpacity,
                backgroundColor: colors.accentSoft,
                borderColor: `${colors.accent}88`,
                borderWidth: 1.5,
                transform: [{ translateX: pillX }],
              },
            ]}
          />
        )}

        {visible.map((route) => {
          const isFocused = route.key === focusedRouteKey;
          const { options } = descriptors[route.key];
          const color = isFocused ? colors.accent : colors.textSecondary;
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
              onPress={onPress}
              onLayout={(e) => onItemLayout(route.key, e)}
              android_ripple={{ color: "transparent" }}
              style={styles.item}
              hitSlop={6}
            >
              <Feather name={TAB_ICONS[route.name] ?? "circle"} size={iconSize} color={color} />
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
    justifyContent: "space-around",
    paddingHorizontal: 6,
    position: "relative",
  },
  /** Fixed-size capsule that slides under the active icon. */
  slidingPill: {
    position: "absolute",
    left: 0,
    top: (TAB_BAR_HEIGHT - PILL_H) / 2,
    width: PILL_W,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 0,
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
});
