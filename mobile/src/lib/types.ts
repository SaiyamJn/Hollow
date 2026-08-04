export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
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

export interface QuickNote {
  id: string;
  content: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  starred: boolean;
  dueAt: string | null;
  parentTaskId: string | null;
  subtasks?: Task[];
  createdAt: string;
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
