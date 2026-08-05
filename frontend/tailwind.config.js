/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { 0: "var(--surface-0)", 1: "var(--surface-1)", 2: "var(--surface-2)" },
        border: "var(--border)",
        accent: { DEFAULT: "var(--accent)", soft: "var(--accent-soft)" },
        danger: "var(--danger)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "palette-in": {
          from: { opacity: "0", transform: "translate(-50%, -8px)" },
          to: { opacity: "1", transform: "translate(-50%, 0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease",
        "pop-in": "pop-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        "rise-in": "rise-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "palette-in": "palette-in 0.16s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-soft": "pulse-soft 1.2s ease-in-out infinite",
      },
    },
  },
};
