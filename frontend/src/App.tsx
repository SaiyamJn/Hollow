import { Navigate, Route, Routes } from "react-router-dom";
import { ReactNode } from "react";
import { useAuthStore } from "./stores/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AppShell from "./pages/AppShell";
import Home from "./pages/Home";
import Notebooks from "./pages/Notebooks";
import NotebookDetail from "./pages/NotebookDetail";
import PageEditor from "./pages/PageEditor";
import Settings from "./pages/Settings";
import QuickNotes from "./pages/QuickNotes";
import Tasks from "./pages/Tasks";
import GraphView from "./pages/GraphView";
import AdminDashboard from "./pages/AdminDashboard";

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="notebooks" element={<Notebooks />} />
        <Route path="notebooks/:notebookId" element={<NotebookDetail />} />
        <Route path="notebooks/:notebookId/sections/:sectionId/pages/:pageId" element={<PageEditor />} />
        <Route path="quick-notes" element={<QuickNotes />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="notebooks/:notebookId/graph" element={<GraphView />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
