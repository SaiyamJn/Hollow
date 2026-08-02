import { ReactNode } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../contexts/theme";

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  /** Stronger frost for modals / prominent panels. */
  strong?: boolean;
}

// Frosted panel used across screens. BlurView on iOS/Android when available;
// falls back to a translucent tint if blur isn't useful.
export function GlassCard({ children, style, contentStyle, intensity, strong }: GlassCardProps) {
  const { theme, colors } = useTheme();
  const blur = intensity ?? (strong ? 55 : 40);
  // Android BlurView is costly during scroll/first paint — solid tint is enough.
  const useBlur = Platform.OS === "ios";

  return (
    <View style={[styles.shell, { borderColor: colors.glassBorder }, style]}>
      {useBlur ? (
        <BlurView
          intensity={blur}
          tint={theme === "dark" ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme === "dark" ? "rgba(22, 24, 27, 0.92)" : "rgba(255, 255, 255, 0.92)",
            },
          ]}
        />
      )}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  content: {
    position: "relative",
  },
});
