import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../contexts/theme";

/** Centered empty / all-clear panel used across tab screens. */
export default function EmptyState({
  icon,
  title,
  subtitle,
  compact,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View
        style={[
          styles.icon,
          compact && styles.iconCompact,
          { backgroundColor: colors.accentSoft },
        ]}
      >
        <Feather name={icon} size={compact ? 24 : 36} color={colors.accent} />
      </View>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: compact ? 15 : 18,
          fontWeight: "600",
          marginTop: compact ? 10 : 14,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 13,
          textAlign: "center",
          marginTop: 6,
          lineHeight: 18,
          maxWidth: 280,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  compact: { paddingVertical: 16 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCompact: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
});
