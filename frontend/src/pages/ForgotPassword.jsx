import { useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { Field } from "../components/ui.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await api.post("/auth/forgot-password", { email: email.trim() });
      const tok = unwrap(res)?.resetToken;
      setMsg(tok ? `Reset link created. Demo token: ${tok}` : "If that email exists, a reset link was sent.");
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-display text-xl font-bold">Forgot password</h2>
        {msg && <div className="alert-ok break-all">{msg}</div>}
        {error && <div className="alert-err">{error}</div>}
        <Field label="Account email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        <p className="text-center text-sm"><Link className="link" to="/login">Back to login</Link></p>
      </form>
    </div>
  );
}
