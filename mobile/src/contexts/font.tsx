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

type WithDefaults = { defaultProps?: { style?: unknown } };

/** Apply the chosen face to Text / TextInput app-wide. */
function applyGlobalFontFamily(family: string | undefined) {
  const base = family ? { fontFamily: family } : {};
  const textComponent = Text as unknown as WithDefaults;
  const inputComponent = TextInput as unknown as WithDefaults;
  textComponent.defaultProps = { ...(textComponent.defaultProps ?? {}), style: base };
  inputComponent.defaultProps = { ...(inputComponent.defaultProps ?? {}), style: base };
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
