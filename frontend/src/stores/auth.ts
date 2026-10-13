import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../lib/types";
import { queryClient } from "../lib/queryClient";
import { useUnlockStore } from "./unlock";

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

function purgeAccountData() {
  try {
    queryClient.clear();
    useUnlockStore.getState().clearAll();
    localStorage.removeItem("hollow-offline-queue");
    localStorage.removeItem("hollow-notified-tasks");
    localStorage.removeItem("hollow-notif-snooze");
  } catch {
    // ignore
  }
}

// JWT kept in memory + localStorage (see settings screen note: fine for this
// project, would need hardening for a high-security production deployment).
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        const prevUser = get().user;
        if (prevUser && prevUser.id !== user.id) {
          purgeAccountData();
        }
        set({ token, user });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        purgeAccountData();
        set({ token: null, user: null });
      },
    }),
    { name: "hollow-auth" }
  )
);
