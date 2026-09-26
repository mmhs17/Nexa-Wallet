import { useState } from "react";
import api, { apiError, unwrap } from "../api/client.js";
import { inr } from "../utils/format.js";
import { PageHeader } from "../components/ui.jsx";

const PRESETS = [100, 500, 1000, 5000, 10000];

export default function AddMoney() {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (val) => {
    const n = Number(val);
    if (!n || n <= 0) { setError("Enter a valid amount."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/wallet/add-money", { amount: n, currency: "INR" });
      setDone(n);
    } catch (e) { setError(apiError(e)); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="space-y-5">
        <PageHeader title="Add Money" subtitle="Sandbox credit added successfully." />
        <div className="card !p-8 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="font-display text-2xl font-bold">{inr(done)} Added</h2>
          <p className="mt-2 text-slate-300">Your sandbox wallet has been credited.</p>
          <p className="mt-1 text-xs text-slate-500">DEMO ENVIRONMENT — NO REAL MONEY</p>
          <button className="btn-primary mt-5" onClick={() => setDone(null)}>Add More</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <PageHeader title="Add Money" subtitle="Credit your sandbox wallet for testing." />
      <div className="card !p-5 space-y-4">
        <div>
          <label className="label">Amount (₹)</label>
          <input className="input text-xl" type="number" min="1" step="0.01"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Sandbox only — no real money is involved.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(v => (
            <button key={v} className="btn-ghost flex-1 min-w-[80px]"
              onClick={() => setAmount(String(v))}>{inr(v)}</button>
          ))}
        </div>
        <button className="btn-primary w-full" onClick={() => handleSubmit(amount)} disabled={submitting}>
          {submitting ? "Processing…" : "Add Money"}
        </button>
      </div>
      {error && <div className="alert-err">{error}</div>}
    </div>
  );
}
