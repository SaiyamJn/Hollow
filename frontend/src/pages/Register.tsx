import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await register(email.trim(), password, name.trim(), username.trim());
      setAuth(token, user);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Registration failed");
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
          <BrandMark size="lg" wordmark wordmarkClassName="text-xl" />
          <p className="text-sm text-secondary mt-3">Create an account</p>
        </div>
        <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          placeholder="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          pattern="[A-Za-z0-9_]{3,32}"
          title="3–32 characters: letters, numbers, underscores"
          required
        />
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" variant="accent" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </Button>
        <p className="text-sm text-secondary">
          Have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
