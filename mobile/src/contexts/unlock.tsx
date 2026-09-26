import { createContext, ReactNode, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

interface UnlockContextValue {
  sectionPasswords: Record<string, string>;
  notebookPasswords: Record<string, string>;
  unlockedNotebooks: Record<string, boolean>;
  setSectionPassword: (sectionId: string, password: string) => void;
  unlockNotebook: (notebookId: string, sectionIds: string[], password: string) => void;
  relockSection: (sectionId: string) => void;
  relockNotebook: (notebookId: string, sectionIds: string[]) => void;
  clearAll: () => void;
  recordActivity: () => void;
}

const UnlockContext = createContext<UnlockContextValue | null>(null);

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Section passwords are held in React state ONLY — never SecureStore or
// AsyncStorage — matching the web client's in-memory-only handling.
export function UnlockProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [sectionPasswords, setSectionPasswords] = useState<Record<string, string>>({});
  const [notebookPasswords, setNotebookPasswords] = useState<Record<string, string>>({});
  const [unlockedNotebooks, setUnlockedNotebooks] = useState<Record<string, boolean>>({});
  const lastActiveRef = useRef<number>(Date.now());

  const recordActivity = useCallback(() => {
    lastActiveRef.current = Date.now();
  }, []);

  const clearAll = useCallback(() => {
    setSectionPasswords({});
    setNotebookPasswords({});
    setUnlockedNotebooks({});
    queryClient.removeQueries({ queryKey: ["page"] });
    queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    queryClient.invalidateQueries({ queryKey: ["notebook"] });
  }, [queryClient]);

  // Lock encrypted notes when phone is locked or app transitions to inactive/background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        clearAll();
      } else if (nextAppState === "active") {
        if (Date.now() - lastActiveRef.current > INACTIVITY_TIMEOUT_MS) {
          clearAll();
        }
        lastActiveRef.current = Date.now();
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [clearAll]);

  // Check for inactivity in foreground
  useEffect(() => {
    const interval = setInterval(() => {
      const hasUnlocked =
        Object.keys(sectionPasswords).length > 0 ||
        Object.keys(notebookPasswords).length > 0 ||
        Object.keys(unlockedNotebooks).length > 0;
      if (hasUnlocked && Date.now() - lastActiveRef.current > INACTIVITY_TIMEOUT_MS) {
        clearAll();
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [clearAll, sectionPasswords, notebookPasswords, unlockedNotebooks]);

  const value: UnlockContextValue = {
    sectionPasswords,
    notebookPasswords,
    unlockedNotebooks,
    setSectionPassword: (sectionId, password) => {
      recordActivity();
      setSectionPasswords((prev) => ({ ...prev, [sectionId]: password }));
    },
    unlockNotebook: (notebookId, sectionIds, password) => {
      recordActivity();
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
    clearAll,
    recordActivity,
  };

  return <UnlockContext.Provider value={value}>{children}</UnlockContext.Provider>;
}

export function useUnlock() {
  const ctx = useContext(UnlockContext);
  if (!ctx) throw new Error("useUnlock must be used within an UnlockProvider");
  return ctx;
}
