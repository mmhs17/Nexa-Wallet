import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client.js";
import { Field } from "../components/ui.jsx";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(location.state?.token || "");
  const [email, setEmail] = useState(location.state?.email || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setMsg("");
    try {
      await api.post("/auth/verify-email", { token: token.trim() });
      setMsg("Email verified. You can sign in now.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) { setError(apiError(err, "Verification failed")); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (!email) { setError("Enter your email to resend the link"); return; }
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await api.post("/auth/resend-verification", { email: email.trim() });
      const tok = res?.data?.data?.emailVerifyToken || res?.data?.emailVerifyToken;
      setMsg(tok ? `Verification re-sent. Demo token: ${tok}` : "Verification email sent.");
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <form onSubmit={verify} className="card space-y-4">
        <h2 className="font-display text-xl font-bold">Verify your email</h2>
        <p className="text-sm text-slate-400">Paste the token from your verification email (demo shows it on screen / server logs).</p>
        {msg && <div className="alert-ok break-all">{msg}</div>}
        {error && <div className="alert-err">{error}</div>}
        <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Verification token"><input className="input" value={token} onChange={(e) => setToken(e.target.value)} required /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Verifying…" : "Verify email"}</button>
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="link" onClick={resend}>Resend link</button>
          <Link className="link" to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  );
}
