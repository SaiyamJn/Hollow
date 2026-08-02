import { lazy, ReactNode, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./stores/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AppShell from "./pages/AppShell";
import Home from "./pages/Home";

// Heavy routes stay out of the initial JS bundle (BlockNote, xyflow, etc.).
const Notebooks = lazy(() => import("./pages/Notebooks"));
const NotebookDetail = lazy(() => import("./pages/NotebookDetail"));
const PageEditor = lazy(() => import("./pages/PageEditor"));
const Settings = lazy(() => import("./pages/Settings"));
const QuickNotes = lazy(() => import("./pages/QuickNotes"));
const Tasks = lazy(() => import("./pages/Tasks"));
const GraphView = lazy(() => import("./pages/GraphView"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-sm text-secondary">Loading…</div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    // If hydration already finished between render and effect.
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);

  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-secondary">Loading…</div>;
  }
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
        <Route
          path="notebooks"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Notebooks />
            </Suspense>
          }
        />
        <Route
          path="notebooks/:notebookId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <NotebookDetail />
            </Suspense>
          }
        />
        <Route
          path="notebooks/:notebookId/sections/:sectionId/pages/:pageId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PageEditor />
            </Suspense>
          }
        />
        <Route
          path="quick-notes"
          element={
            <Suspense fallback={<RouteFallback />}>
              <QuickNotes />
            </Suspense>
          }
        />
        <Route
          path="tasks"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Tasks />
            </Suspense>
          }
        />
        <Route
          path="notebooks/:notebookId/graph"
          element={
            <Suspense fallback={<RouteFallback />}>
              <GraphView />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Settings />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AdminDashboard />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
