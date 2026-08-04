import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { adminLogin } from "../lib/api";
import { useAdminStore } from "../stores/admin";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export default function AdminLogin() {
  const navigate = useNavigate();
  const token = useAdminStore((s) => s.token);
  const setAdmin = useAdminStore((s) => s.setAdmin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/admin" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token: next, email: adminEmail } = await adminLogin(email, password);
      setAdmin(next, adminEmail);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-surface-0 p-6"
      style={{ backgroundImage: "var(--glow)" }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border glass-strong p-8 space-y-4 shadow-pop animate-rise-in"
      >
        <div className="pb-1">
          <div className="flex items-center gap-2.5">
            <BrandMark size="md" />
            <div>
              <h1 className="text-xl font-medium tracking-tight">Admin</h1>
              <p className="text-xs text-secondary">Hollow</p>
            </div>
          </div>
          <p className="text-sm text-secondary mt-3">
            Sign in with the credentials from your server <code className="text-accent">.env</code>.
          </p>
        </div>
        <Input
          type="email"
          placeholder="Admin email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
        <Input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="accent" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-sm text-secondary text-center">
          <Link to="/login" className="text-accent hover:underline">
            Back to user login
          </Link>
        </p>
      </form>
    </div>
  );
}
