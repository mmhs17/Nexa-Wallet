import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Field } from "../components/ui.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await login({ identifier: identifier.trim(), password });
      if (result?.twoFactorRequired) {
        navigate("/2fa/verify", { state: { pendingSessionId: result.pendingSessionId, user: result.user } });
        return;
      }
      navigate(location.state?.from || "/dashboard");
    } catch (err) { setError(apiError(err, "Login failed")); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="font-display text-3xl font-bold tracking-tight">NEXA <span className="text-nexa-300">Wallet</span></div>
        <p className="mt-1 text-sm text-slate-400">Pay Smart. Stay Protected.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-display text-xl font-bold">Welcome back</h2>
        {error && <div className="alert-err">{error}</div>}
        <Field label="Username, email or phone">
          <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com" autoComplete="username" required />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={busy}
          onClick={() => {
            setIdentifier("friend1");
            setPassword("Test@1234");
            setError("");
          }}
        >
          Fill demo credentials (friend1)
        </button>
        <div className="flex items-center justify-between text-sm">
          <Link className="link" to="/forgot-password">Forgot password?</Link>
          <Link className="link" to="/register">Create account</Link>
        </div>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">DEMO ENVIRONMENT — NO REAL MONEY</p>
    </div>
  );
}

export function useResendVerification() {
  const [state, setState] = useState({ busy: false, msg: "", err: "" });
  const resend = async (email) => {
    setState({ busy: true, msg: "", err: "" });
    try {
      await api.post("/auth/resend-verification", { email });
      setState({ busy: false, msg: "Verification email sent. Check your inbox (or server logs in demo).", err: "" });
    } catch (err) { setState({ busy: false, msg: "", err: apiError(err) }); }
  };
  return { ...state, resend };
}

export function unwrapLoginData(res) { return unwrap(res); }
