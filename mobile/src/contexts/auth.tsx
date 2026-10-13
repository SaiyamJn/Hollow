import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  api,
  setApiToken,
  login as apiLogin,
  register as apiRegister,
  logoutAuthSession,
} from "../lib/api";
import { deleteSecureItem, getSecureItem, setSecureItem } from "../lib/secureStorage";
import { queryClient } from "../lib/queryClient";
import type { User } from "../lib/types";

type Status = "loading" | "signedIn" | "signedOut";

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (login: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, username: string) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  /** `localOnly` skips the server revoke (e.g. session already ended remotely). */
  logout: (opts?: { localOnly?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "hollow-token";
const USER_KEY = "hollow-user";

async function purgeAccountCache() {
  try {
    queryClient.clear();
    await AsyncStorage.multiRemove([
      "hollow-offline-queue",
      "hollow-nav-memory",
      "hollow-notified-tasks",
      "hollow-fired-once",
      "hollow-snoozed-tasks",
    ]);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  // Cold start: restore session from storage immediately.
  // Phone sessions stay logged in permanently until explicitly signed out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getSecureItem(TOKEN_KEY);
        if (cancelled) return;
        if (!token) {
          setStatus("signedOut");
          return;
        }
        setApiToken(token);

        const storedUser = await getSecureItem(USER_KEY);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            // ignore corrupt cache
          }
        }
        setStatus("signedIn");

        // Ping /auth/me in background to keep user details fresh, but never auto-logout on phone.
        void api
          .get("/auth/me")
          .then((res) => {
            if (cancelled) return;
            if (res.data?.user) {
              setUser(res.data.user);
              void setSecureItem(USER_KEY, JSON.stringify(res.data.user));
            }
          })
          .catch(() => {
            // offline / network error / ping failure — preserve phone session
          });
      } catch {
        if (!cancelled) setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistSession(token: string, nextUser: User) {
    await purgeAccountCache();
    setApiToken(token);
    setUser(nextUser);
    setStatus("signedIn");
    await setSecureItem(TOKEN_KEY, token);
    await setSecureItem(USER_KEY, JSON.stringify(nextUser));
  }

  async function updateUser(nextUser: User) {
    setUser(nextUser);
    await setSecureItem(USER_KEY, JSON.stringify(nextUser));
  }

  async function login(identifier: string, password: string) {
    const { token, user: nextUser } = await apiLogin(identifier, password);
    await persistSession(token, nextUser);
  }

  async function register(email: string, password: string, name: string, username: string) {
    const { token, user: nextUser } = await apiRegister(email, password, name, username);
    await persistSession(token, nextUser);
  }

  async function logout(opts?: { localOnly?: boolean }) {
    if (!opts?.localOnly) {
      try {
        await logoutAuthSession();
      } catch {
        // Still clear local session if the network/server call fails.
      }
    }
    await purgeAccountCache();
    await deleteSecureItem(TOKEN_KEY);
    await deleteSecureItem(USER_KEY);
    setApiToken(null);
    setUser(null);
    setStatus("signedOut");
  }

  return (
    <AuthContext.Provider value={{ status, user, login, register, updateUser, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
