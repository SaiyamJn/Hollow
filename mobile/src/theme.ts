// React Native has no CSS variables, so the web globals.css light/dark
// palettes live here as constant objects; components read the active set
// from the ThemeContext.
export const darkColors = {
  surface0: "#0c1010",
  surface1: "#131918",
  surface2: "#1b2422",
  textPrimary: "#eef6f2",
  textSecondary: "#8fa39a",
  border: "#2a3532",
  accent: "#6edcb6",
  accentSoft: "rgba(110, 220, 182, 0.14)",
  danger: "#fb8383",
  warn: "#edb84a",
  noteYellow: "rgba(250, 204, 21, 0.2)",
  noteGreen: "rgba(52, 211, 153, 0.18)",
  noteBlue: "rgba(96, 165, 250, 0.18)",
  noteRed: "rgba(251, 113, 133, 0.18)",
  notePurple: "rgba(192, 132, 252, 0.18)",
  // Translucent surface tint layered over BlurView for glass chrome.
  glass: "rgba(19, 25, 24, 0.48)",
  glassBorder: "rgba(110, 220, 182, 0.08)",
};

export const lightColors = {
  surface0: "#f3f8f5",
  surface1: "#ffffff",
  surface2: "#e7f3ec",
  textPrimary: "#12241c",
  textSecondary: "#547066",
  border: "#cfe0d6",
  accent: "#0e9f72",
  accentSoft: "rgba(14, 159, 114, 0.16)",
  danger: "#e24747",
  warn: "#e08912",
  noteYellow: "rgba(250, 184, 8, 0.42)",
  noteGreen: "rgba(16, 185, 129, 0.3)",
  noteBlue: "rgba(59, 130, 246, 0.28)",
  noteRed: "rgba(244, 63, 94, 0.26)",
  notePurple: "rgba(168, 85, 247, 0.26)",
  glass: "rgba(232, 246, 238, 0.55)",
  glassBorder: "rgba(18, 36, 28, 0.08)",
};

export type ThemeColors = typeof darkColors;

export const NOTE_COLOR_KEYS = ["gray", "yellow", "green", "blue", "red", "purple"] as const;

export function noteTint(colors: ThemeColors, color: string | undefined): string {
  switch (color) {
    case "yellow":
      return colors.noteYellow;
    case "green":
      return colors.noteGreen;
    case "blue":
      return colors.noteBlue;
    case "red":
      return colors.noteRed;
    case "purple":
      return colors.notePurple;
    default:
      return "transparent";
  }
}
