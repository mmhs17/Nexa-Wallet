import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { inr, factorLabel } from "../utils/format.js";
import { PageHeader } from "../components/ui.jsx";
import DemoDirectory from "../components/DemoDirectory.jsx";

export default function SendMoney() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [profile, setProfile] = useState(null);
  const [risk, setRisk] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [wallet, setWallet] = useState(null);

  /* Security key (4-digit PIN) state. */
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const loadPinStatus = async () => {
    try {
      const s = unwrap(await api.get("/security/tx-pin"));
      setPinRequired(Boolean(s?.enabled));
    } catch { /* status is advisory only — never block the flow on it */ }
  };

  useEffect(() => {
    api.get("/wallet").then(r => setWallet(unwrap(r))).catch(() => {});
    loadPinStatus();
  }, []);

  const handleFind = async () => {
    if (!recipient.trim()) { setError("Enter recipient info."); return; }
    setError(null);
    try {
      const res = await api.get("/wallet/recipients/resolve?q=" + encodeURIComponent(recipient.trim()));
      const d = unwrap(res);
      if (!d?.username) { setError("No user found."); return; }
      setProfile(d);
      setStep(2);
    } catch (e) { setError(apiError(e)); }
  };

  const handlePreflight = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { setError("Enter a valid amount."); return; }
    if (Number(amount) > Number(wallet?.balance || 0)) { setError("Insufficient balance."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/fraud/preflight", {
        to: profile.username,
        amount: Number(amount),
      });
      setRisk(unwrap(res));
      setStep(3);
    } catch (e) { setError(apiError(e)); }
    finally { setSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (pinRequired) {
      if (!/^\d{4}$/.test(pin)) { setPinError("Enter your 4-digit security key."); return; }
    }
    setSubmitting(true);
    setError(null);
    setPinError("");
    try {
      const res = await api.post("/wallet/send", {
        to: profile.username,
        amount: Number(amount),
        note: note || undefined,
        ...(pinRequired ? { pin } : {}),
      });
      setResult(unwrap(res));
      setStep(4);
    } catch (e) {
      /* A wrong key must never advance the step or silently re-submit. */
      if (e?.response?.data?.error?.code === "TX_PIN_INVALID") {
        setPin("");
        setPinError(apiError(e));
      } else {
        setError(apiError(e));
        setStep(3);
      }
    } finally { setSubmitting(false); }
  };

  const cancel = () => {
    setStep(1); setRecipient(""); setAmount(""); setNote("");
    setProfile(null); setRisk(null); setResult(null); setError(null);
    setPin(""); setPinError("");
  };

  const s1 = () => (
    <div className="space-y-5">
      <PageHeader title="Send Money" subtitle="Pay securely with NEXA risk analysis." />
      <div className="card !p-5 space-y-4">
        <div>
          <label className="label">Recipient</label>
          <input className="input" placeholder="Username, email, phone, or NEXA ID"
            value={recipient} onChange={e => setRecipient(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleFind()} />
          <p className="mt-1 text-xs text-slate-500">Privacy Shield may hide users you haven't transacted with.</p>
        </div>
        <button className="btn-primary w-full" onClick={handleFind} disabled={submitting}>
          {submitting ? "Searching…" : "Find Recipient"}
        </button>
        {error && <div className="alert-err">{error}</div>}
      </div>

      <DemoDirectory
        title="Test Users & IDs"
        onPickIdentifier={(id) => { setRecipient(id); setError(""); }}
      />
    </div>
  );

  const s2 = () => (
    <div className="space-y-5">
      <PageHeader title="Recipient" subtitle="Verify who you're paying." />
      <div className="card !p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xl">👤</div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold truncate">{profile?.fullName || profile?.username}</h2>
            <p className="text-sm text-slate-400">
              {(profile?.email ? profile.email + " · " : "") + (profile?.phone ? profile.phone + " · " : "") + (profile?.relationship || "New recipient")}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {profile?.nexaId && (
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-slate-300">{profile.nexaId}</span>
              )}
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-slate-300">@{profile?.username}</span>
              {profile?.isVerified && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">✅ Verified</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Amount (₹)</label>
            <input className="input" type="number" min="1" max="500000" step="0.01" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Available: {inr(wallet?.balance)}</p>
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input className="input" placeholder="What's this for?" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-ghost" onClick={cancel}>Back</button>
          <button className="btn-primary ml-auto" onClick={handlePreflight} disabled={submitting}>
            {submitting ? "Scanning…" : "NEXA Security Check"}
          </button>
        </div>
        {error && <div className="alert-err">{error}</div>}
      </div>
    </div>
  );


  const s3 = () => (
    <div className="space-y-5">
      <PageHeader title="Review Payment" subtitle="NEXA Security Check" />
      <div className="card !p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-400">To: {profile?.fullName || profile?.username}</span>
          <span className="font-display text-3xl font-bold">{inr(Number(amount))}</span>
        </div>
        {note && <p className="text-sm text-slate-300"><span className="text-slate-500">Note:</span> {note}</p>}

        {risk && (
          <div className="rounded-xl p-4"
            style={{
              background: risk.level === "HIGH" ? "rgba(244,63,94,0.08)" : risk.level === "MEDIUM" ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)"
            }}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: risk.level === "HIGH" ? "#f43f5e" : risk.level === "MEDIUM" ? "#f59e0b" : "#10b981" }}>
                Risk Score
              </span>
              <span className="font-display text-2xl font-bold"
                style={{ color: risk.level === "HIGH" ? "#f43f5e" : risk.level === "MEDIUM" ? "#f59e0b" : "#10b981" }}>
                {risk.score}/100 — {risk.level}
              </span>
            </div>
            {risk.factors?.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {risk.factors.map((f, i) => <li key={i} className="text-slate-300">• {factorLabel(f)}</li>)}
              </ul>
            )}
            {risk.recommendation && <p className="mt-2 text-sm italic text-slate-400">{risk.recommendation}</p>}
          </div>
        )}
        {pinRequired && (
          <div>
            <label className="label">NEXA Security Key</label>
            <input
              className="input text-center font-mono text-lg tracking-[0.5em]"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            />
            {pinError
              ? <p className="mt-1 text-xs text-rose-400">{pinError}</p>
              : <p className="mt-1 text-xs text-slate-500">4-digit key required to authorize this payment.</p>}
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={cancel}>Cancel</button>
          <button className="btn-primary ml-auto" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Processing…" : pinRequired ? "Enter Key & Pay" : "Verify & Pay"}
          </button>
        </div>
        {error && <div className="alert-err">{error}</div>}
      </div>
    </div>
  );

  const s4 = () => (
    <div className="space-y-5">
      <PageHeader title="Payment Complete" subtitle="Your transaction has been processed." />
      <div className="card !p-5 text-center space-y-4">
        {result?.status === "COMPLETED" ? (
          <>
            <div className="text-5xl">✅</div>
            <h2 className="font-display text-2xl font-bold">Payment Sent</h2>
            <p className="text-slate-300">{inr(Number(amount))} sent to {profile?.fullName || profile?.username}</p>
            {result?.txnId && (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-300">
                {result.txnId}
              </div>
            )}
            {result?.risk && (
              <p className="text-xs text-slate-500">Risk {result.risk.score}/100 · {result.risk.level} · {result.risk.decision}</p>
            )}
          </>
        ) : result?.status === "UNDER_REVIEW" ? (
          <>
            <div className="text-5xl">⏳</div>
            <h2 className="font-display text-2xl font-bold text-amber-300">Under Review</h2>
            <p className="text-slate-300">Pending NEXA security review. Funds held in escrow.</p>
          </>
        ) : (
          <>
            <div className="text-5xl">🚨</div>
            <h2 className="font-display text-2xl font-bold text-rose-300">Payment Blocked</h2>
            <p className="text-slate-300">NEXA flagged this as high risk. No funds moved.</p>
          </>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button className="btn-ghost" onClick={cancel}>New Payment</button>
          <button className="btn-primary" onClick={() => navigate("/transactions")}>View Transactions</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {step === 1 && s1()}
      {step === 2 && s2()}
      {step === 3 && s3()}
      {step === 4 && s4()}
    </div>
  );
}

