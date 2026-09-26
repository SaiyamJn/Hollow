import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { fetchPreferences, updatePreferences } from "../lib/api";
import { useAuthStore } from "../stores/auth";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) ?? "dark");

  useEffect(() => {
    if (!token) return;
    void fetchPreferences().then((prefs) => {
      if (prefs?.theme === "light" || prefs?.theme === "dark") {
        setTheme(prefs.theme);
      }
    }).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      if (useAuthStore.getState().token) {
        void updatePreferences({ theme: next }).catch(() => undefined);
      }
      return next;
    });

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
