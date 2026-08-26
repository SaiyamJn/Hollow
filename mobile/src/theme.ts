// React Native has no CSS variables, so the web globals.css light/dark
// palettes live here as constant objects; components read the active set
// from the ThemeContext.
export const darkColors = {
  surface0: "#0a0f0e",
  surface1: "#121a18",
  surface2: "#1c2825",
  textPrimary: "#f2faf6",
  textSecondary: "#8fb5a6",
  border: "#2e403b",
  accent: "#5ee9b5",
  accentSoft: "rgba(94, 233, 181, 0.18)",
  danger: "#ff8a8a",
  warn: "#fbbf24",
  noteYellow: "rgba(250, 204, 21, 0.26)",
  noteGreen: "rgba(52, 211, 153, 0.24)",
  noteBlue: "rgba(96, 165, 250, 0.24)",
  noteRed: "rgba(251, 113, 133, 0.24)",
  notePurple: "rgba(192, 132, 252, 0.24)",
  // Translucent surface tint layered over BlurView for glass chrome.
  glass: "rgba(18, 26, 24, 0.5)",
  glassBorder: "rgba(94, 233, 181, 0.12)",
};

export const lightColors = {
  surface0: "#eef8f2",
  surface1: "#ffffff",
  surface2: "#dff3e8",
  textPrimary: "#0f2a1f",
  textSecondary: "#4a7262",
  border: "#b9ddcb",
  accent: "#0cb879",
  accentSoft: "rgba(12, 184, 121, 0.2)",
  danger: "#ef4444",
  warn: "#f59e0b",
  noteYellow: "rgba(250, 184, 8, 0.5)",
  noteGreen: "rgba(16, 185, 129, 0.38)",
  noteBlue: "rgba(59, 130, 246, 0.34)",
  noteRed: "rgba(244, 63, 94, 0.32)",
  notePurple: "rgba(168, 85, 247, 0.32)",
  glass: "rgba(220, 246, 232, 0.58)",
  glassBorder: "rgba(15, 42, 31, 0.09)",
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
