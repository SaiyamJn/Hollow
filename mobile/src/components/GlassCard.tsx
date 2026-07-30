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

  return (
    <View style={[styles.shell, { borderColor: colors.glassBorder }, style]}>
      <BlurView
        intensity={blur}
        tint={theme === "dark" ? "dark" : "light"}
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]}
      />
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
