// React Native has no CSS variables, so the web globals.css light/dark
// palettes live here as constant objects; components read the active set
// from the ThemeContext.
export const darkColors = {
  surface0: "#0f1012",
  surface1: "#16181b",
  surface2: "#1e2126",
  textPrimary: "#edeef0",
  textSecondary: "#979aa1",
  border: "#26292f",
  accent: "#62d9ae",
  accentSoft: "rgba(98, 217, 174, 0.1)",
  danger: "#f87171",
  // Translucent surface tint layered over BlurView for glass chrome.
  glass: "rgba(22, 24, 27, 0.55)",
};

export const lightColors = {
  surface0: "#fafaf8",
  surface1: "#ffffff",
  surface2: "#f1f1ee",
  textPrimary: "#1c1c1a",
  textSecondary: "#6d6f74",
  border: "#e4e4e0",
  accent: "#0d8a68",
  accentSoft: "rgba(13, 138, 104, 0.09)",
  danger: "#dc2626",
  glass: "rgba(255, 255, 255, 0.55)",
};

export type ThemeColors = typeof darkColors;
