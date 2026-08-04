import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import {
  DEFAULT_FONT,
  FONT_ASSETS,
  FONT_STORAGE_KEY,
  familyFor,
  type FontId,
  isFontId,
} from "../lib/fonts";

interface FontContextValue {
  font: FontId;
  setFont: (id: FontId) => void;
  fontsReady: boolean;
  /** Resolved RN fontFamily for the active choice (undefined = system). */
  fontFamily?: string;
}

const FontContext = createContext<FontContextValue | null>(null);

// Patch Text / TextInput so the chosen face applies app-wide without
// touching every screen. Custom fonts win over bare fontWeight.
function applyGlobalFontFamily(family: string | undefined) {
  const base = family ? { fontFamily: family } : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TextAny = Text as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputAny = TextInput as any;
  textAny.defaultProps = { ...(textAny.defaultProps ?? {}), style: base };
  inputAny.defaultProps = { ...(inputAny.defaultProps ?? {}), style: base };
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const [font, setFontState] = useState<FontId>(DEFAULT_FONT);

  useEffect(() => {
    void AsyncStorage.getItem(FONT_STORAGE_KEY).then((stored) => {
      if (isFontId(stored)) setFontState(stored);
    });
  }, []);

  const fontFamily = familyFor(font);

  useEffect(() => {
    if (!fontsLoaded && font !== "system") return;
    applyGlobalFontFamily(fontFamily);
    void AsyncStorage.setItem(FONT_STORAGE_KEY, font);
  }, [font, fontFamily, fontsLoaded]);

  function setFont(id: FontId) {
    setFontState(id);
  }

  const fontsReady = fontsLoaded || font === "system";

  return (
    <FontContext.Provider value={{ font, setFont, fontsReady, fontFamily }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error("useFont must be used within a FontProvider");
  return ctx;
}
