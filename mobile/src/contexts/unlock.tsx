import { createContext, ReactNode, useContext, useState } from "react";

interface UnlockContextValue {
  sectionPasswords: Record<string, string>;
  notebookPasswords: Record<string, string>;
  unlockedNotebooks: Record<string, boolean>;
  setSectionPassword: (sectionId: string, password: string) => void;
  unlockNotebook: (notebookId: string, sectionIds: string[], password: string) => void;
  relockSection: (sectionId: string) => void;
  relockNotebook: (notebookId: string, sectionIds: string[]) => void;
  clearAll: () => void;
}

const UnlockContext = createContext<UnlockContextValue | null>(null);

// Section passwords are held in React state ONLY — never SecureStore or
// AsyncStorage — matching the web client's in-memory-only handling.
export function UnlockProvider({ children }: { children: ReactNode }) {
  const [sectionPasswords, setSectionPasswords] = useState<Record<string, string>>({});
  const [notebookPasswords, setNotebookPasswords] = useState<Record<string, string>>({});
  const [unlockedNotebooks, setUnlockedNotebooks] = useState<Record<string, boolean>>({});

  const value: UnlockContextValue = {
    sectionPasswords,
    notebookPasswords,
    unlockedNotebooks,
    setSectionPassword: (sectionId, password) =>
      setSectionPasswords((prev) => ({ ...prev, [sectionId]: password })),
    unlockNotebook: (notebookId, sectionIds, password) => {
      setUnlockedNotebooks((prev) => ({ ...prev, [notebookId]: true }));
      setNotebookPasswords((prev) => ({ ...prev, [notebookId]: password }));
      setSectionPasswords((prev) => ({
        ...prev,
        ...Object.fromEntries(sectionIds.map((id) => [id, password])),
      }));
    },
    relockSection: (sectionId) =>
      setSectionPasswords((prev) => {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      }),
    relockNotebook: (notebookId, sectionIds) => {
      setUnlockedNotebooks((prev) => {
        const next = { ...prev };
        delete next[notebookId];
        return next;
      });
      setNotebookPasswords((prev) => {
        const next = { ...prev };
        delete next[notebookId];
        return next;
      });
      setSectionPasswords((prev) => {
        const next = { ...prev };
        for (const id of sectionIds) delete next[id];
        return next;
      });
    },
    clearAll: () => {
      setSectionPasswords({});
      setNotebookPasswords({});
      setUnlockedNotebooks({});
    },
  };

  return <UnlockContext.Provider value={value}>{children}</UnlockContext.Provider>;
}

export function useUnlock() {
  const ctx = useContext(UnlockContext);
  if (!ctx) throw new Error("useUnlock must be used within an UnlockProvider");
  return ctx;
}
