import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import axios, { AxiosError } from "axios";
import { Platform } from "react-native";
import type { Backlink, DailyNote, Notebook, Page, PageMeta, QuickNote, RecentPage, Section, Task, User } from "./types";

// Resolve the backend URL. Priority:
// 1. EXPO_PUBLIC_API_URL (dev .env or EAS build env — baked at build time)
// 2. app.config.js → extra.apiUrl (same value when set for EAS)
// 3. On web: localhost (browser can't reach the phone's LAN host)
// 4. Metro bundler host + :4000 (Expo Go / local backend on same Wi‑Fi)
// 5. localhost (emulator / last resort)
//
// Production (Nginx): use http(s)://HOST/api  — must include the /api suffix.
// Local backend only:  http://LAN_IP:4000
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromExtra = String(Constants.expoConfig?.extra?.apiUrl ?? "").trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");
  if (Platform.OS === "web") return "http://localhost:4000";
  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.5:8081"
  if (hostUri) return `http://${hostUri.split(":")[0]}:4000`;
  return "http://localhost:4000";
}

export const API_URL = resolveBaseUrl();

export const api = axios.create({ baseURL: API_URL, timeout: 10_000 });

// The auth context sets this once the token is loaded from SecureStore.
let authToken: string | null = null;
export function setApiToken(token: string | null) {
  authToken = token;
}

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

export async function replayQueue() {
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
  const config = error.config;
  const isNetworkError = !error.response;
  const isWrite = config?.method && config.method.toLowerCase() !== "get";
  if (isNetworkError && isWrite && config && !(config as any).__queued) {
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

export interface HealthInfo {
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
export async function login(email: string, password: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
  return data;
}

export async function register(email: string, password: string, name: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/register", { email, password, name });
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

export async function fetchBacklinks(pageId: string) {
  const { data } = await api.get<Backlink[]>(`/pages/${pageId}/backlinks`);
  return data;
}

export async function fetchOutlinks(pageId: string) {
  const { data } = await api.get<Backlink[]>(`/pages/${pageId}/outlinks`);
  return data;
}

export async function fetchGraph(notebookId: string) {
  const { data } = await api.get<{
    nodes: { id: string; title: string }[];
    edges: { source: string; target: string }[];
  }>(`/notebooks/${notebookId}/graph`);
  return data;
}

export async function fetchRecentPages(limit = 8) {
  const { data } = await api.get<RecentPage[]>("/pages/recent", { params: { limit } });
  return data;
}

// "en-CA" formats as YYYY-MM-DD in the user's local timezone.
export function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

export async function openDailyNote() {
  const { data } = await api.post<DailyNote>("/pages/daily", { date: todayISO() });
  return data;
}

// ---- quick notes ----
export async function fetchQuickNotes(includeArchived: boolean) {
  const { data } = await api.get<QuickNote[]>("/quick-notes", {
    params: includeArchived ? { archived: "true" } : {},
  });
  return data;
}

export async function createQuickNote(content: string, color?: string) {
  const { data } = await api.post<QuickNote>("/quick-notes", { content, ...(color ? { color } : {}) });
  return data;
}

export async function updateQuickNote(
  id: string,
  patch: Partial<Pick<QuickNote, "content" | "color" | "pinned" | "archived">>
) {
  const { data } = await api.patch<QuickNote>(`/quick-notes/${id}`, patch);
  return data;
}

export async function deleteQuickNote(id: string) {
  await api.delete(`/quick-notes/${id}`);
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
    dueAt?: string | null;
  }
) {
  const { data } = await api.patch<Task>(`/tasks/${id}`, patch);
  return data;
}

export async function deleteTask(id: string) {
  await api.delete(`/tasks/${id}`);
}
