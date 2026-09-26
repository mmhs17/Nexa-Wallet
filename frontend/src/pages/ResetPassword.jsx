import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client.js";
import { Field } from "../components/ui.jsx";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") || "");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setMsg("");
    if (pw !== confirm) { setError("Passwords do not match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token: token.trim(), newPassword: pw });
      setMsg("Password reset. Redirecting to login…");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) { setError(apiError(err, "Reset failed")); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-display text-xl font-bold">Set a new password</h2>
        {msg && <div className="alert-ok">{msg}</div>}
        {error && <div className="alert-err">{error}</div>}
        <Field label="Reset token"><input className="input" value={token} onChange={(e) => setToken(e.target.value)} required /></Field>
        <Field label="New password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></Field>
        <Field label="Confirm password"><input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
        <p className="text-center text-sm"><Link className="link" to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}
