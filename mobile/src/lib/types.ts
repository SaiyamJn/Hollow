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

export interface Page {
  id: string;
  title: string;
  content: string;
  sectionId: string;
  updatedAt: string;
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
  title: string;
  content: string;
  kind: "note" | "list";
  items: ChecklistItem[] | null;
  color: string;
  pinned: boolean;
  archived: boolean;
  sortOrder?: number;
  deletedAt?: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  starred: boolean;
  /** Important × urgent focus class */
  focus?: "none" | "critical" | "steady" | "swift" | "quiet";
  dueAt: string | null;
  /** daily | weekly | monthly | yearly */
  repeatRule: "daily" | "weekly" | "monthly" | "yearly" | null;
  /** Weekdays 0=Sun…6=Sat when weekly */
  repeatDays?: number[] | null;
  /** Every N units of repeatRule */
  repeatInterval?: number | null;
  /** never | on | after */
  repeatEnd?: "never" | "on" | "after" | null;
  repeatUntil?: string | null;
  /** Remaining occurrences (incl. current) when end = after */
  repeatCount?: number | null;
  parentTaskId: string | null;
  subtasks?: Task[];
  createdAt: string;
}

export type TaskRepeatRule = NonNullable<Task["repeatRule"]>;

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
