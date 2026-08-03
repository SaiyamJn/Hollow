import axios from "axios";
import { useAuthStore } from "../stores/auth";
import { useUnlockStore } from "../stores/unlock";
import type {
  AdminStats,
  Backlink,
  DailyNote,
  GraphData,
  Notebook,
  Page,
  PageMeta,
  QuickNote,
  RecentPage,
  Section,
  Tag,
  Task,
  User,
} from "./types";

// Empty string must not win: Docker sets VITE_API_URL= which would bypass ?? and
// POST to /auth/... (SPA) → nginx 405. Always prefer a real base, default /api.
const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "/api";

export const api = axios.create({
  baseURL: apiBase,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired/invalid JWT -> drop the session and land on /login. A 401 with a
// section-password message is NOT a session problem, so leave those alone.
api.interceptors.response.use(undefined, (error) => {
  const status = error.response?.status;
  const message = error.response?.data?.error;
  if (status === 401 && (message === "Missing token" || message === "Invalid or expired token")) {
    useAuthStore.getState().logout();
    useUnlockStore.getState().clearAll();
  }
  return Promise.reject(error);
});

function sectionHeaders(password?: string) {
  return password ? { "x-section-password": password } : {};
}

// ---- auth ----
export async function register(email: string, password: string, name: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/register", { email, password, name });
  return data;
}

export async function login(email: string, password: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
  return data;
}

// ---- notebooks / sections ----
export async function fetchNotebooks() {
  const { data } = await api.get<Notebook[]>("/notebooks");
  return data;
}

export async function createNotebook(title: string) {
  const { data } = await api.post<Notebook>("/notebooks", { title });
  return data;
}

export async function renameNotebook(id: string, title: string) {
  const { data } = await api.patch<Notebook>(`/notebooks/${id}`, { title });
  return data;
}

export async function deleteNotebook(id: string) {
  await api.delete(`/notebooks/${id}`);
}

export async function createSection(notebookId: string, title: string, notebookPassword?: string) {
  const { data } = await api.post<Section>(
    `/notebooks/${notebookId}/sections`,
    { title },
    { headers: sectionHeaders(notebookPassword) }
  );
  return data;
}

export async function lockNotebook(notebookId: string, password: string) {
  await api.post(`/notebooks/${notebookId}/lock`, { password });
}

export async function unlockNotebook(notebookId: string, password: string) {
  await api.post(`/notebooks/${notebookId}/unlock`, { password });
}

export async function lockSection(sectionId: string, password: string) {
  await api.post(`/sections/${sectionId}/lock`, { password });
}

export async function unlockSection(sectionId: string, password: string) {
  await api.post(`/sections/${sectionId}/unlock`, { password });
}

// ---- pages ----
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

export async function renamePage(pageId: string, title: string) {
  const { data } = await api.patch<PageMeta>(`/pages/${pageId}`, { title });
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
export function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

export async function openDailyNote() {
  const { data } = await api.post<DailyNote>("/pages/daily", { date: todayISO() });
  return data;
}

// ---- graph ----
export async function fetchGraph(notebookId: string) {
  const { data } = await api.get<GraphData>(`/notebooks/${notebookId}/graph`);
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

// ---- admin ----
export async function fetchAdminStats() {
  const { data } = await api.get<AdminStats>("/admin/stats");
  return data;
}

// ---- tags ----
export async function addTagToPage(pageId: string, name: string) {
  const { data } = await api.post<Tag>(`/pages/${pageId}/tags`, { name });
  return data;
}

export async function removeTagFromPage(pageId: string, tagId: string) {
  await api.delete(`/pages/${pageId}/tags/${tagId}`);
}
