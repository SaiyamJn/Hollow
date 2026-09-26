import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  api,
  setApiToken,
  setOnUnauthorized,
  login as apiLogin,
  register as apiRegister,
  logoutAuthSession,
  SESSION_ENDED,
} from "../lib/api";
import { deleteSecureItem, getSecureItem, setSecureItem } from "../lib/secureStorage";
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

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64Decode(input: string): string {
  const clean = input.replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  let out = "";
  for (const char of clean) {
    const idx = B64.indexOf(char);
    if (idx === -1) continue;
    value = (value << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

// Decode the JWT payload (base64url) without verifying — the client only
// needs the `exp` claim to know when to prompt a re-login.
function jwtExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return false;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    const jsonStr =
      typeof globalThis.atob === "function" ? globalThis.atob(b64) : base64Decode(b64);
    const { exp } = JSON.parse(jsonStr);
    return typeof exp === "number" && exp > 0 && exp * 1000 < Date.now();
  } catch {
    // If client decode is inconclusive, do NOT treat token as expired.
    // Let backend /auth/me or API calls validate the session.
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  // Cold start: restore session from storage immediately (don't block the UI
  // on a heavy /notebooks tree). Validate the token in the background.
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
        if (jwtExpired(token)) {
          await deleteSecureItem(TOKEN_KEY);
          await deleteSecureItem(USER_KEY);
          if (!cancelled) setStatus("signedOut");
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

        // Cheap session ping — kicks out only on 401 with SESSION_ENDED; offline keeps the session.
        void api
          .get("/auth/me")
          .then((res) => {
            if (cancelled) return;
            if (res.data?.user) {
              setUser(res.data.user);
              void setSecureItem(USER_KEY, JSON.stringify(res.data.user));
            }
          })
          .catch(async (err: any) => {
            if (cancelled) return;
            const message = err.response?.data?.error;
            if (err.response?.status === 401 && typeof message === "string" && SESSION_ENDED.has(message)) {
              setApiToken(null);
              await deleteSecureItem(TOKEN_KEY);
              await deleteSecureItem(USER_KEY);
              setUser(null);
              setStatus("signedOut");
            }
          });
      } catch {
        if (!cancelled) setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // On return to foreground, re-validate session with server rather than
  // abruptly terminating on client-side timer comparisons.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        const token = await getSecureItem(TOKEN_KEY);
        if (token) {
          void api.get("/auth/me").catch((err) => {
            const message = err.response?.data?.error;
            if (err.response?.status === 401 && typeof message === "string" && SESSION_ENDED.has(message)) {
              void logout({ localOnly: true });
            }
          });
        }
      } catch {
        // ignore storage errors on resume
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistSession(token: string, nextUser: User) {
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
    await deleteSecureItem(TOKEN_KEY);
    await deleteSecureItem(USER_KEY);
    setApiToken(null);
    setUser(null);
    setStatus("signedOut");
  }

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    setOnUnauthorized(() => {
      void logoutRef.current({ localOnly: true });
    });
    return () => setOnUnauthorized(null);
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, register, updateUser, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
