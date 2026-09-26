import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiError } from "../api/client.js";
import { Field } from "../components/ui.jsx";

export default function TwoFAVerify() {
  const { verify2FA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingSessionId = location.state?.pendingSessionId || "";
  const [token, setToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await verify2FA({ pendingSessionId, token: useRecovery ? undefined : token.trim(), recoveryCode: useRecovery ? recoveryCode.trim() : undefined });
      navigate("/dashboard");
    } catch (err) { setError(apiError(err, "2FA verification failed")); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-display text-xl font-bold">Two-factor check</h2>
        <p className="text-sm text-slate-400">Enter the 6-digit code from your authenticator app, or use a recovery code.</p>
        {error && <div className="alert-err">{error}</div>}
        {!useRecovery ? (
          <Field label="Authenticator code">
            <input className="input tracking-[0.3em]" value={token} onChange={(e) => setToken(e.target.value)} inputMode="numeric" maxLength={8} placeholder="123456" required />
          </Field>
        ) : (
          <Field label="Recovery code">
            <input className="input" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder="xxxx-xxxx" required />
          </Field>
        )}
        <button className="btn-primary w-full" disabled={busy || !pendingSessionId}>{busy ? "Verifying…" : "Verify & sign in"}</button>
        <button type="button" className="link text-sm" onClick={() => setUseRecovery((v) => !v)}>
          {useRecovery ? "Use authenticator code instead" : "Use a recovery code instead"}
        </button>
      </form>
    </div>
  );
}
