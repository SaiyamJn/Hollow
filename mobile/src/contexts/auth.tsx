import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { api, setApiToken, login as apiLogin, register as apiRegister } from "../lib/api";
import { deleteSecureItem, getSecureItem, setSecureItem } from "../lib/secureStorage";
import type { User } from "../lib/types";

type Status = "loading" | "signedIn" | "signedOut";

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "hollow-token";
const USER_KEY = "hollow-user";

// Minimal base64 decode — Hermes has atob on recent SDKs but this avoids
// depending on it (and on Node's Buffer, which RN doesn't have).
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
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(base64Decode(payload));
    return typeof exp === "number" && exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  // On launch: token comes from SecureStore on native (Keychain/Keystore) or
  // AsyncStorage on web, then is validated with a cheap authenticated call
  // before we show the main app.
  useEffect(() => {
    (async () => {
      try {
        const token = await getSecureItem(TOKEN_KEY);
        const storedUser = await getSecureItem(USER_KEY);
        if (!token || jwtExpired(token)) {
          setStatus("signedOut");
          return;
        }
        setApiToken(token);
        try {
          await api.get("/notebooks");
          if (storedUser) setUser(JSON.parse(storedUser));
          setStatus("signedIn");
        } catch (err: any) {
          if (err.response?.status === 401) {
            setApiToken(null);
            setStatus("signedOut");
          } else {
            // offline — trust the stored, unexpired token
            if (storedUser) setUser(JSON.parse(storedUser));
            setStatus("signedIn");
          }
        }
      } catch {
        setStatus("signedOut");
      }
    })();
  }, []);

  // On return to foreground, check token expiry and prompt re-login instead
  // of silently failing mid-session (spec: 04-mobile-spec.md, networking).
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        const token = await getSecureItem(TOKEN_KEY);
        if (token && jwtExpired(token)) await logout();
      } catch {
        // ignore storage errors on resume
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistSession(token: string, nextUser: User) {
    await setSecureItem(TOKEN_KEY, token);
    await setSecureItem(USER_KEY, JSON.stringify(nextUser));
    setApiToken(token);
    setUser(nextUser);
    setStatus("signedIn");
  }

  async function login(email: string, password: string) {
    const { token, user: nextUser } = await apiLogin(email, password);
    await persistSession(token, nextUser);
  }

  async function register(email: string, password: string, name: string) {
    const { token, user: nextUser } = await apiRegister(email, password, name);
    await persistSession(token, nextUser);
  }

  async function logout() {
    await deleteSecureItem(TOKEN_KEY);
    await deleteSecureItem(USER_KEY);
    setApiToken(null);
    setUser(null);
    setStatus("signedOut");
  }

  return (
    <AuthContext.Provider value={{ status, user, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
