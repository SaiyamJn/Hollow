import { create } from "zustand";

// Section passwords live in memory ONLY (never persisted): they are needed to
// derive the decryption key server-side on each request, and writing them to
// localStorage would defeat the point of encryption at rest.
interface UnlockState {
  sectionPasswords: Record<string, string>;
  unlockedNotebooks: Record<string, boolean>;
  setSectionPassword: (sectionId: string, password: string) => void;
  unlockNotebook: (notebookId: string, sectionIds: string[], password: string) => void;
  relockSection: (sectionId: string) => void;
  relockNotebook: (notebookId: string, sectionIds: string[]) => void;
  clearAll: () => void;
}

export const useUnlockStore = create<UnlockState>()((set) => ({
  sectionPasswords: {},
  unlockedNotebooks: {},
  setSectionPassword: (sectionId, password) =>
    set((s) => ({ sectionPasswords: { ...s.sectionPasswords, [sectionId]: password } })),
  unlockNotebook: (notebookId, sectionIds, password) =>
    set((s) => ({
      unlockedNotebooks: { ...s.unlockedNotebooks, [notebookId]: true },
      sectionPasswords: {
        ...s.sectionPasswords,
        ...Object.fromEntries(sectionIds.map((id) => [id, password])),
      },
    })),
  relockSection: (sectionId) =>
    set((s) => {
      const next = { ...s.sectionPasswords };
      delete next[sectionId];
      return { sectionPasswords: next };
    }),
  relockNotebook: (notebookId, sectionIds) =>
    set((s) => {
      const passwords = { ...s.sectionPasswords };
      for (const id of sectionIds) delete passwords[id];
      const notebooks = { ...s.unlockedNotebooks };
      delete notebooks[notebookId];
      return { sectionPasswords: passwords, unlockedNotebooks: notebooks };
    }),
  clearAll: () => set({ sectionPasswords: {}, unlockedNotebooks: {} }),
}));
