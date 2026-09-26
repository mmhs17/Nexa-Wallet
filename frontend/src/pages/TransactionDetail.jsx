import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { inr, fmtDate, riskBadge, statusBadge, factorLabel } from "../utils/format.js";
import { PageHeader } from "../components/ui.jsx";

export default function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [txn, setTxn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      try { const res = await api.get("/transactions/" + id); setTxn(unwrap(res)); }
      catch (e) { setError(apiError(e)); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><div className="text-sm">Loading…</div></div>;
  if (error && !txn) return <div className="flex flex-col items-center gap-3 py-20"><div className="alert-err max-w-md text-center">{error}</div><button className="btn-ghost" onClick={() => navigate("/transactions")}>Back</button></div>;
  if (!txn) return null;

  const isReceived = txn.direction === "CREDIT";
  const counterparty = txn.counterparty;

  const exportCsv = async () => {
    try {
      const res = await api.get("/transactions/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexa-transactions-${txn.reference || txn.id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { /* noop */ }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="Transaction Details" />
        <div className="flex items-center gap-3">
          <button onClick={exportCsv} className="text-xs text-nexa-300 hover:text-nexa-200 underline underline-offset-2">Export CSV</button>
          <Link to="/transactions" className="text-xs text-nexa-300 hover:text-nexa-200 underline underline-offset-2">← Back</Link>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card !p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Transaction ID</div>
          <div className="mt-1 font-mono text-sm text-slate-300 break-all">{txn.id}</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div><div className="label">Status</div><span className={statusBadge(txn.status)}>{txn.status}</span></div>
            <div><div className="label">Direction</div><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${txn.direction === "CREDIT" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-rose-500/15 text-rose-300 border-rose-500/30"}`}>{txn.direction}</span></div>
          </div>
          <div className="mt-5"><div className="label">Amount</div><div className="font-display text-3xl font-bold">{isReceived ? "+" : "−"}{inr(txn.amount)}</div><div className="mt-1 text-xs text-slate-400">{txn.currency || "INR"}</div></div>
          <div className="mt-5"><div className="label">Date & Time</div><div className="text-sm text-slate-300">{fmtDate(txn.createdAt)}</div></div>
          <div className="mt-5"><div className="label">Transaction Ref</div><div className="font-mono text-sm text-slate-300 break-all">{txn.reference || txn.id}</div></div>
          <div className="mt-5"><div className="label">Payment Method</div><div className="text-sm text-slate-300">{txn.paymentMethod || "—"}</div></div>
          <div className="mt-5"><div className="label">Category</div><div className="text-sm text-slate-300">{txn.category?.name || "—"}</div></div>
          <div className="mt-5"><div className="label">Note</div><div className="text-sm text-slate-300">{txn.note || "—"}</div></div>
          <div className="mt-5"><div className="label">Completed</div><div className="text-sm text-slate-300">{txn.completedAt ? fmtDate(txn.completedAt) : "—"}</div></div>
        </div>
        <div className="card !p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Counterparty</h3>
          <div className="mt-3 flex items-center gap-3">
            <div className="rounded-full bg-nexa-500/20 p-3 text-2xl">👤</div>
            <div>
              <div className="font-display font-bold">{counterparty?.fullName || counterparty?.username || "—"}</div>
              <div className="text-sm text-slate-400">{counterparty ? `@${counterparty.username}` : ""}</div>
              <div className="mt-1 text-xs text-slate-500">{isReceived ? "Received from" : "Sent to"}{txn.category?.name ? ` · ${txn.category.name}` : ""}</div>
            </div>
          </div>
          {txn.risk && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">NEXA Risk Assessment</h3>
              <div className={`rounded-xl border p-4 mb-3 ${txn.risk.level === "HIGH" ? "border-rose-500/30 bg-rose-500/5" : txn.risk.level === "MEDIUM" ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: txn.risk.level === "HIGH" ? "#f43f5e" : txn.risk.level === "MEDIUM" ? "#f59e0b" : "#10b981" }}>Risk Score</span>
                  <span className="font-display text-2xl font-bold" style={{ color: txn.risk.level === "HIGH" ? "#f43f5e" : txn.risk.level === "MEDIUM" ? "#f59e0b" : "#10b981" }}>{txn.risk.score}/100 — {txn.risk.level}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">Decision: {txn.risk.decision} · Engine {txn.risk.engineVersion}</div>
                {txn.risk.recommendation && <p className="mt-2 text-sm italic text-slate-400">{txn.risk.recommendation}</p>}
              </div>
              {(txn.risk.factors || []).map((f, i) => (
                <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5 text-sm">
                  <span className="text-slate-300">{factorLabel(f)}</span>
                  {f?.points != null && <span className="text-xs font-semibold text-amber-300 shrink-0">+{f.points}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
