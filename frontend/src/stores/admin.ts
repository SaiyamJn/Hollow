import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AdminState {
  token: string | null;
  email: string | null;
  setAdmin: (token: string, email: string) => void;
  logout: () => void;
}

/** Separate from the normal user session — admin JWT from ADMIN_EMAIL / ADMIN_PASSWORD. */
export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      setAdmin: (token, email) => set({ token, email }),
      logout: () => set({ token: null, email: null }),
    }),
    { name: "hollow-admin" }
  )
);
