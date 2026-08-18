import { Text, View } from "react-native";

export function initialsFromName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "";
  return (first + second).toUpperCase();
}

export function AccountAvatar({
  name,
  size = 56,
  colors,
}: {
  name?: string | null;
  size?: number;
  colors: { accent: string; accentSoft: string };
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: colors.accent,
          fontSize: size * 0.34,
          fontWeight: "600",
          letterSpacing: 0.4,
        }}
      >
        {initialsFromName(name)}
      </Text>
    </View>
  );
}
