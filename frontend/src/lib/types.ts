export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
}

export interface AuthSession {
  id: string;
  deviceName: string;
  platform: string;
  client: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface PageMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  title: string;
  notebookId: string;
  isLocked: boolean;
  pages: PageMeta[];
}

export interface Notebook {
  id: string;
  title: string;
  isLocked: boolean;
  sections: Section[];
}

export interface Tag {
  id: string;
  name: string;
}

export interface Page {
  id: string;
  title: string;
  content: string;
  sectionId: string;
  updatedAt: string;
  tags: Tag[];
  section: {
    id: string;
    title: string;
    notebookId: string;
    isLocked: boolean;
  };
}

export interface Backlink {
  id: string;
  title: string;
  sectionId: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface QuickNote {
  id: string;
  title?: string;
  content: string;
  kind?: "note" | "list";
  items?: ChecklistItem[] | null;
  color: string;
  pinned: boolean;
  archived: boolean;
  sortOrder?: number;
  deletedAt?: string | null;
  createdAt: string;
}

export type TaskRepeatRule = "daily" | "weekly" | "monthly" | "yearly";
export type TaskFocus = "none" | "critical" | "steady" | "swift" | "quiet";

export interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  starred: boolean;
  /** Important × urgent focus class */
  focus?: TaskFocus;
  dueAt: string | null;
  repeatRule?: "daily" | "weekly" | "monthly" | "yearly" | null;
  /** Weekdays 0=Sun…6=Sat when weekly */
  repeatDays?: number[] | null;
  repeatInterval?: number | null;
  repeatEnd?: "never" | "on" | "after" | null;
  repeatUntil?: string | null;
  repeatCount?: number | null;
  parentTaskId: string | null;
  subtasks?: Task[];
  createdAt: string;
}

export interface GraphData {
  nodes: { id: string; title: string }[];
  edges: { source: string; target: string }[];
}

export interface RecentPage {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  section: {
    id: string;
    title: string;
    isLocked: boolean;
    notebookId: string;
    notebook: { title: string; isLocked: boolean };
  };
}

export interface DailyNote {
  id: string;
  title: string;
  sectionId: string;
  notebookId: string;
  created: boolean;
}

export interface AdminUserStats {
  id: string;
  name: string;
  username: string;
  email: string;
  joinedAt: string;
  notebooks: number;
  sections: number;
  lockedSections: number;
  pages: number;
  quickNotes: number;
  tasks: number;
  tasksDone: number;
  lastActive: string | null;
  contentBytes: number;
}

export interface AdminStats {
  totals: {
    users: number;
    notebooks: number;
    sections: number;
    pages: number;
    quickNotes: number;
    tasks: number;
    links: number;
  };
  users: AdminUserStats[];
}
