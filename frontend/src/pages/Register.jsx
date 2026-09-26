import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { Field } from "../components/ui.jsx";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", phone: "", fullName: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setVerifyToken("");
    if (form.password !== form.confirm) { setError("Passwords do not match"); return; }
    setBusy(true);
    try {
      const res = await api.post("/auth/register", {
        username: form.username.trim(), email: form.email.trim(),
        phone: form.phone.trim() || undefined, fullName: form.fullName.trim(), password: form.password,
      });
      const data = unwrap(res);
      if (data?.emailVerifyToken) setVerifyToken(data.emailVerifyToken);
      navigate("/verify-email", { state: { email: form.email.trim(), token: data?.emailVerifyToken } });
    } catch (err) { setError(apiError(err, "Registration failed")); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="font-display text-3xl font-bold tracking-tight">NEXA <span className="text-nexa-300">Wallet</span></div>
        <p className="mt-1 text-sm text-slate-400">Create your sandbox wallet in seconds.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-display text-xl font-bold">Create account</h2>
        {error && <div className="alert-err">{error}</div>}
        {verifyToken && <div className="alert-info break-all">Demo verify token: {verifyToken}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={form.fullName} onChange={set("fullName")} required /></Field>
          <Field label="Username"><input className="input" value={form.username} onChange={set("username")} required /></Field>
        </div>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={set("email")} required /></Field>
        <Field label="Phone (optional)"><input className="input" value={form.phone} onChange={set("phone")} placeholder="+91…" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password"><input className="input" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" required /></Field>
          <Field label="Confirm password"><input className="input" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" required /></Field>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="text-center text-sm text-slate-400">Already have an account? <Link className="link" to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
