import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import axios, { AxiosError } from "axios";
import { Platform } from "react-native";
import { deviceAuthMeta } from "./deviceInfo";
import type {
  AuthSession,
  Backlink,
  ChecklistItem,
  DailyNote,
  Notebook,
  Page,
  PageMeta,
  QuickNote,
  RecentPage,
  Section,
  Task,
  User,
} from "./types";

/** Expo tunnel / ngrok hosts — Metro only; never a Hollow API host. */
function isTunnelOrPublicDevHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.includes("exp.direct") ||
    h.includes("exp.host") ||
    h.includes("ngrok") ||
    h.includes("tunnel") ||
    h.endsWith(".loca.lt")
  );
}

function lanBackendFromMetro(): string | null {
  // Prefer debuggerHost / hostUri like "192.168.1.5:8081" — not tunnel URLs.
  const candidates = [
    Constants.expoConfig?.hostUri,
    (Constants as any).manifest2?.extra?.expoClient?.hostUri,
    (Constants as any).manifest?.debuggerHost,
    (Constants as any).linkingUri,
  ]
    .filter(Boolean)
    .map(String);

  for (const raw of candidates) {
    // "192.168.1.5:8081" or "http://192.168.1.5:8081"
    const match = raw.match(/(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?/);
    if (match) return `http://${match[1]}:4000`;

    try {
      const withProto = raw.includes("://") ? raw : `http://${raw}`;
      const { hostname } = new URL(withProto);
      if (hostname && !isTunnelOrPublicDevHost(hostname) && hostname !== "localhost") {
        return `http://${hostname}:4000`;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

// Resolve the backend URL. Priority:
// 1. EXPO_PUBLIC_API_URL (dev .env or EAS build env — baked at build time)
// 2. app.config.js → extra.apiUrl (same value when set for EAS)
// 3. On web: localhost
// 4. LAN IP from Metro (same Wi‑Fi, local backend) — never Expo tunnel hosts
// 5. localhost (emulator / last resort)
//
// Production (Nginx): use http(s)://HOST/api  — must include the /api suffix.
// Local backend only:  http://LAN_IP:4000
// With `expo start --tunnel`, you MUST set EXPO_PUBLIC_API_URL (see mobile/.env).
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromExtra = String(Constants.expoConfig?.extra?.apiUrl ?? "").trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");
  if (Platform.OS === "web") return "http://localhost:4000";
  const fromLan = lanBackendFromMetro();
  if (fromLan) return fromLan;
  return "http://localhost:4000";
}

const API_URL = resolveBaseUrl();

// Release APKs on cellular / flaky Wi‑Fi need more headroom than Expo Go on LAN.
export const api = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: { Accept: "application/json" },
});

// The auth context sets this once the token is loaded from SecureStore.
let authToken: string | null = null;
export function setApiToken(token: string | null) {
  authToken = token;
}

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
  onUnauthorized = cb;
}

const SESSION_ENDED = new Set([
  "Missing token",
  "Invalid or expired token",
  "Session ended. Please sign in again.",
]);

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

// ---- offline write queue (spec: 04-mobile-spec.md) ----
// Mutating requests that fail with a network error (no response) are queued
// in AsyncStorage as { method, url, body } and replayed in order when
// connectivity returns.
const QUEUE_KEY = "hollow-offline-queue";

interface QueuedWrite {
  method: string;
  url: string;
  body: unknown;
  headers?: Record<string, string>;
}

async function enqueue(write: QueuedWrite) {
  const raw = (await AsyncStorage.getItem(QUEUE_KEY)) ?? "[]";
  const queue: QueuedWrite[] = JSON.parse(raw);
  queue.push(write);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function replayQueue() {
  const raw = (await AsyncStorage.getItem(QUEUE_KEY)) ?? "[]";
  const queue: QueuedWrite[] = JSON.parse(raw);
  if (queue.length === 0) return;
  await AsyncStorage.setItem(QUEUE_KEY, "[]");
  for (const write of queue) {
    try {
      await api.request({ method: write.method, url: write.url, data: write.body, headers: write.headers });
    } catch {
      // still offline (or rejected) — requeue and stop
      await enqueue(write);
      break;
    }
  }
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const status = error.response?.status;
  const message = (error.response?.data as { error?: string } | undefined)?.error;
  if (status === 401 && typeof message === "string" && SESSION_ENDED.has(message)) {
    onUnauthorized?.();
  }

  const config = error.config;
  const isNetworkError = !error.response;
  const isWrite = config?.method && config.method.toLowerCase() !== "get";
  const url = String(config?.url ?? "");
  const isAuthWrite = url.includes("/auth/");
  if (isNetworkError && isWrite && !isAuthWrite && config && !(config as any).__queued) {
    await enqueue({
      method: config.method!,
      url: config.url!,
      body: config.data ? JSON.parse(config.data) : undefined,
      headers: config.headers?.["x-section-password"]
        ? { "x-section-password": String(config.headers["x-section-password"]) }
        : undefined,
    });
    (error as any).queued = true;
  }
  return Promise.reject(error);
});

// Replay pending writes whenever connectivity comes back (NetInfo listener).
export function initOfflineSync() {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) void replayQueue();
  });
}

function sectionHeaders(password?: string) {
  return password ? { "x-section-password": password } : {};
}

interface HealthInfo {
  ok: boolean;
  name?: string;
  version?: string;
  service?: string;
  time?: string;
}

export async function fetchHealth() {
  const { data } = await api.get<HealthInfo>("/health");
  return data;
}

// ---- auth ----
/** `login` may be email or username. */
export async function login(login: string, password: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/login", {
    login,
    password,
    ...deviceAuthMeta(),
  });
  return data;
}

export async function register(email: string, password: string, name: string, username: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/register", {
    email,
    password,
    name,
    username,
    ...deviceAuthMeta(),
  });
  return data;
}

export async function fetchAuthSessions() {
  const { data } = await api.get<{ sessions: AuthSession[] }>("/auth/sessions");
  return data.sessions;
}

export async function revokeAuthSession(id: string) {
  const { data } = await api.delete<{ ok: boolean; current: boolean }>(`/auth/sessions/${id}`);
  return data;
}

export async function revokeOtherAuthSessions() {
  const { data } = await api.post<{ ok: boolean; revoked: number }>("/auth/sessions/revoke-others");
  return data;
}

export async function logoutAuthSession() {
  await api.post("/auth/logout");
}

export async function updateAccount(input: {
  currentPassword?: string;
  name?: string;
  username?: string;
  email?: string;
  newPassword?: string;
}) {
  const { data } = await api.patch<{ user: User; revoked: number }>("/auth/account", input);
  return data;
}

// ---- notebooks / sections / pages ----
export async function fetchNotebooks() {
  const { data } = await api.get<Notebook[]>("/notebooks");
  return data;
}

export async function createNotebook(title: string) {
  const { data } = await api.post<Notebook>("/notebooks", { title });
  return data;
}

export async function deleteNotebook(id: string) {
  await api.delete(`/notebooks/${id}`);
}

export async function renameNotebook(id: string, title: string) {
  const { data } = await api.patch<Notebook>(`/notebooks/${id}`, { title });
  return data;
}

export async function createSection(notebookId: string, title: string, notebookPassword?: string) {
  const { data } = await api.post<Section>(
    `/notebooks/${notebookId}/sections`,
    { title },
    { headers: sectionHeaders(notebookPassword) }
  );
  return data;
}

export async function deleteSection(sectionId: string) {
  await api.delete(`/sections/${sectionId}`);
}

export async function unlockNotebook(notebookId: string, password: string) {
  await api.post(`/notebooks/${notebookId}/unlock`, { password });
}

export async function unlockSection(sectionId: string, password: string) {
  await api.post(`/sections/${sectionId}/unlock`, { password });
}

export async function createPage(sectionId: string, title: string, sectionPassword?: string) {
  const { data } = await api.post<PageMeta & { sectionId: string }>(
    `/sections/${sectionId}/pages`,
    { title },
    { headers: sectionHeaders(sectionPassword) }
  );
  return data;
}

export async function fetchPage(pageId: string, sectionPassword?: string) {
  const { data } = await api.get<Page>(`/pages/${pageId}`, { headers: sectionHeaders(sectionPassword) });
  return data;
}

export async function savePageContent(pageId: string, content: string, sectionPassword?: string) {
  const { data } = await api.put<Page>(`/pages/${pageId}`, { content }, { headers: sectionHeaders(sectionPassword) });
  return data;
}

export async function deletePage(pageId: string) {
  await api.delete(`/pages/${pageId}`);
}

export async function fetchBacklinks(pageId: string) {
  const { data } = await api.get<Backlink[]>(`/pages/${pageId}/backlinks`);
  return data;
}

export async function fetchOutlinks(pageId: string) {
  const { data } = await api.get<Backlink[]>(`/pages/${pageId}/outlinks`);
  return data;
}

export async function fetchRecentPages(limit = 8) {
  const { data } = await api.get<RecentPage[]>("/pages/recent", { params: { limit } });
  return data;
}

// "en-CA" formats as YYYY-MM-DD in the user's local timezone.
function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

export async function openDailyNote() {
  const { data } = await api.post<DailyNote>("/pages/daily", { date: todayISO() });
  return data;
}

// ---- quick notes ----
export async function fetchQuickNotes(includeArchived: boolean, trashed = false) {
  const { data } = await api.get<QuickNote[]>("/quick-notes", {
    params: {
      ...(includeArchived ? { archived: "true" } : {}),
      ...(trashed ? { trashed: "true" } : {}),
    },
  });
  return data;
}

export async function createQuickNote(input: {
  title?: string;
  content?: string;
  color?: string;
  kind?: "note" | "list";
  items?: ChecklistItem[];
}) {
  const { data } = await api.post<QuickNote>("/quick-notes", input);
  return data;
}

export async function updateQuickNote(
  id: string,
  patch: Partial<Pick<QuickNote, "title" | "content" | "color" | "pinned" | "archived" | "items">>
) {
  const { data } = await api.patch<QuickNote>(`/quick-notes/${id}`, patch);
  return data;
}

export async function reorderQuickNotes(ids: string[]) {
  await api.post("/quick-notes/reorder", { ids });
}

/** Soft-delete into the recycle bin (kept 7 days). */
export async function deleteQuickNote(id: string) {
  await api.delete(`/quick-notes/${id}`);
}

/** Permanent delete — used for empty discard and emptying trash. */
export async function deleteQuickNotePermanent(id: string) {
  await api.delete(`/quick-notes/${id}`, { params: { permanent: "true" } });
}

export async function restoreQuickNote(id: string) {
  const { data } = await api.post<QuickNote>(`/quick-notes/${id}/restore`);
  return data;
}

// ---- tasks ----
export async function fetchTasks() {
  const { data } = await api.get<Task[]>("/tasks");
  return data;
}

export async function createTask(input: {
  title: string;
  description?: string;
  dueAt?: string;
  parentTaskId?: string;
  starred?: boolean;
  focus?: "none" | "critical" | "steady" | "swift" | "quiet";
  repeatRule?: "daily" | "weekly" | "monthly" | "yearly" | null;
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: "never" | "on" | "after" | null;
  repeatUntil?: string | null;
  repeatCount?: number | null;
}) {
  const { data } = await api.post<Task>("/tasks", input);
  return data;
}

export async function updateTask(
  id: string,
  patch: {
    title?: string;
    description?: string;
    done?: boolean;
    starred?: boolean;
    focus?: "none" | "critical" | "steady" | "swift" | "quiet";
    dueAt?: string | null;
    repeatRule?: "daily" | "weekly" | "monthly" | "yearly" | null;
    repeatDays?: number[] | null;
    repeatInterval?: number | null;
    repeatEnd?: "never" | "on" | "after" | null;
    repeatUntil?: string | null;
    repeatCount?: number | null;
  }
) {
  const { data } = await api.patch<Task>(`/tasks/${id}`, patch);
  if (patch.done) {
    void import("./notifications").then((m) => m.dismissTaskNotifications(id)).catch(() => undefined);
  }
  return data;
}

export async function deleteTask(id: string) {
  await api.delete(`/tasks/${id}`);
  void import("./notifications").then((m) => m.dismissTaskNotifications(id)).catch(() => undefined);
}
