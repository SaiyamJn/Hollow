import { create } from "zustand";

interface UiState {
  activeNotebookId: string | null;
  setActiveNotebook: (id: string | null) => void;
  focusMode: boolean;
  setFocusMode: (on: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeNotebookId: null,
  setActiveNotebook: (id) => set({ activeNotebookId: id }),
  focusMode: false,
  setFocusMode: (on) => set({ focusMode: on }),
  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}));
