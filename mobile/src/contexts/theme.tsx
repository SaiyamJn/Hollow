import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { darkColors, lightColors, ThemeColors } from "../theme";
import { fetchPreferences, getApiToken, updatePreferences } from "../lib/api";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Mirrors the web ThemeProvider; theme preference isn't sensitive, so plain
// AsyncStorage (not SecureStore) is fine. Dark is the default.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    AsyncStorage.getItem("theme").then((stored) => {
      if (stored === "light" || stored === "dark") setTheme(stored);
    });
    if (getApiToken()) {
      fetchPreferences().then((prefs) => {
        if (prefs?.theme === "light" || prefs?.theme === "dark") {
          setTheme(prefs.theme);
          void AsyncStorage.setItem("theme", prefs.theme);
        }
      }).catch(() => undefined);
    }
  }, []);

  const toggle = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      void AsyncStorage.setItem("theme", next);
      void updatePreferences({ theme: next }).catch(() => undefined);
      return next;
    });

  const colors = theme === "dark" ? darkColors : lightColors;
  return <ThemeContext.Provider value={{ theme, colors, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
