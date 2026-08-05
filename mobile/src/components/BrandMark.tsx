import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../contexts/theme";

type Size = "md" | "lg" | "xl";

const SIZE_PX: Record<Size, number> = {
  md: 28,
  lg: 40,
  xl: 56,
};

const RADIUS: Record<Size, number> = {
  md: 9,
  lg: 12,
  xl: 16,
};

interface BrandMarkProps {
  size?: Size;
  wordmark?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function BrandMark({ size = "md", wordmark = false, style }: BrandMarkProps) {
  const { colors } = useTheme();
  const px = SIZE_PX[size];
  const radius = RADIUS[size];
  return (
    <View style={[styles.row, style]}>
      <Image
        source={require("../../assets/hollow-logo.png")}
        style={{
          width: px,
          height: px,
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
        }}
        resizeMode="cover"
      />
      {wordmark && (
        <Text
          style={{
            color: colors.textPrimary,
            fontWeight: "500",
            fontSize: size === "xl" || size === "lg" ? 20 : 14,
            letterSpacing: -0.3,
          }}
        >
          Hollow
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
