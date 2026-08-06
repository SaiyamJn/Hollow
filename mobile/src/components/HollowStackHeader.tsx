import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";
import { useTheme } from "../contexts/theme";

/**
 * Native stack header with an explicit top inset so titles/back never sit
 * under the Android status bar (web/Expo web doesn't need this).
 */
export function HollowStackHeader({ navigation, route, options, back }: NativeStackHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, StatusBar.currentHeight ?? 0, 24);

  const title =
    typeof options.headerTitle === "string"
      ? options.headerTitle
      : typeof options.title === "string"
        ? options.title
        : route.name;

  const tint = options.headerTintColor ?? colors.accent;
  const canGoBack = Boolean(back);

  return (
    <View
      style={[
        styles.shell,
        {
          paddingTop: topPad,
          backgroundColor: colors.surface0,
          borderBottomColor: colors.glassBorder,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.side}>
          {canGoBack ? (
            <Pressable
              onPress={navigation.goBack}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Feather name="arrow-left" size={20} color={tint} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>

        <View style={[styles.side, styles.sideRight]}>
          {typeof options.headerRight === "function"
            ? options.headerRight({ canGoBack, tintColor: tint })
            : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  side: {
    width: 72,
    minWidth: 72,
    flexDirection: "row",
    alignItems: "center",
  },
  sideRight: {
    justifyContent: "flex-end",
  },
  iconBtn: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "500",
  },
});
