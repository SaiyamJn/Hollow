# Hollow — web frontend spec

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS (`darkMode: "class"`) + shadcn/ui for base components (dialog,
  dropdown, input, button)
- BlockNote (ProseMirror-based) for the Notion-style block editor
- react-flow for the Obsidian-style graph view
- TanStack Query for server data fetching/caching
- Zustand for local UI state (sidebar open/closed, active notebook, theme)
- socket.io-client for realtime
- Axios or fetch wrapper, attaching `Authorization: Bearer <token>` and,
  when viewing a locked section, an `x-section-password` header (see below)

## Theming — implement exactly this way

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { 0: "var(--surface-0)", 1: "var(--surface-1)", 2: "var(--surface-2)" },
        border: "var(--border)",
        accent: "var(--accent)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
      },
    },
  },
};
```

`src/styles/globals.css`:
```css
:root {
  --surface-0: #ffffff; --surface-1: #f4f4f2; --surface-2: #ececea;
  --text-primary: #1a1a18; --text-secondary: #6b6b66;
  --border: #dcdcd8; --accent: #0f6e56;
}
.dark {
  --surface-0: #141414; --surface-1: #191919; --surface-2: #1e1e1e;
  --text-primary: #e8e8e4; --text-secondary: #a5a5a0;
  --border: #2a2a2a; --accent: #5dcaa5;
}
body { background: var(--surface-0); color: var(--text-primary); transition: background 0.15s ease, color 0.15s ease; }
```

`src/theme/ThemeProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) ?? "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);
  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
```

Dark is the default. A toggle (sun/moon icon button) lives in the top bar of
the app shell.

## Visual language (minimal, dark-first)

- Two font weights only: 400 body, 500 for titles/emphasis.
- One accent color (`--accent`), used sparingly: active nav item, checked
  checkboxes, locked-section indicator, tag chips.
- 0.5px hairline borders instead of shadows for separating panels.
- Generous padding (16–28px), no dense/cramped layouts.
- 8px default corner radius; avoid pill shapes except tag chips.
- No gradients, no drop shadows, no decorative icons — icons only where they
  carry meaning (lock, chevron, checkbox).

## Routes / screens

- `/login`, `/register`
- `/` — app shell: left sidebar + main content pane
- `/notebooks/:notebookId/sections/:sectionId/pages/:pageId` — page editor
- `/quick-notes` — Keep-style grid
- `/tasks` — Google Tasks-style list
- `/notebooks/:notebookId/graph` — Obsidian-style graph view
- `/settings` — theme toggle, account info, logout

## Sidebar

- Top: search input, four icon tabs (Notebooks / Quick notes / Tasks / Graph).
- Notebooks tab: collapsible tree — notebook > sections > pages. A lock icon
  next to a locked notebook/section name, tinted with `--accent`.
- Clicking a locked section/notebook for the first time in a session opens a
  password dialog. On success, hold the password **in memory only** (a
  Zustand store, never persisted) for the rest of the session, and attach it
  as the `x-section-password` header on every request for pages in that
  section. Clear it on logout or on an explicit "lock" action.
- "+ New notebook / + New section / + New page" affordances at each tree level.

## Page editor

- BlockNote editor bound to the page's `content`.
- Autosave: debounce 800ms after last keystroke, `PUT /pages/:id`.
- Support checklist blocks (for in-page task-like items, distinct from the
  global Tasks feature), headings, bullet/numbered lists, code blocks.
- Wiki-link autocomplete: typing `[[` opens a page-search popover scoped to
  the current notebook; selecting inserts `[[Page Title]]`.
- Tag chips shown under the title; add/remove via a small input.
- When socket collaboration (phase 2, see backend doc) is wired in, bind the
  editor's Yjs extension to the shared `Y.Doc` for the page; until then,
  just relay raw ops through `page:update` as a placeholder.

## Quick notes (`/quick-notes`)

- Masonry/grid layout of cards, one per `QuickNote`.
- Each card: content, color background (from a fixed small palette), pin
  toggle, archive action, delete.
- Pinned notes sort to the top.

## Tasks (`/tasks`)

- Flat list grouped by due date (Overdue / Today / Upcoming / No date).
- Checkbox to mark done (strikethrough on complete).
- Expand a task to show/add subtasks.
- Quick-add input at the top (title only; due date and subtasks added after
  creation via the task's detail view).

## Graph view (`/notebooks/:id/graph`)

- Fetch `GET /notebooks/:id/graph`, render nodes/edges with react-flow.
- Node = page title; edge = a `[[link]]` between two pages.
- Clicking a node navigates to that page.

## Auth screens

- Simple email/password forms, calling `/auth/login` and `/auth/register`.
- Store the JWT in memory + `localStorage` (acceptable for this project;
  note in the settings screen that this is not suitable for a
  high-security production deployment without hardening).
