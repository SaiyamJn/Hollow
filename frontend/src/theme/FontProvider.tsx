import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  applyFontToDocument,
  DEFAULT_FONT,
  FONT_STORAGE_KEY,
  type FontId,
  isFontId,
} from "../lib/fonts";

interface FontContextValue {
  font: FontId;
  setFont: (id: FontId) => void;
}

const FontContext = createContext<FontContextValue | null>(null);

function readStoredFont(): FontId {
  try {
    const raw = localStorage.getItem(FONT_STORAGE_KEY);
    if (isFontId(raw)) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_FONT;
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [font, setFontState] = useState<FontId>(readStoredFont);

  useEffect(() => {
    applyFontToDocument(font);
    localStorage.setItem(FONT_STORAGE_KEY, font);
  }, [font]);

  return (
    <FontContext.Provider value={{ font, setFont: setFontState }}>{children}</FontContext.Provider>
  );
}

export function useFont() {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error("useFont must be used within a FontProvider");
  return ctx;
}
