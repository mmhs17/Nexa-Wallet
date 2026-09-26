import { useEffect, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { inr, fmtDate } from "../utils/format.js";
import { Stat, PageHeader } from "../components/ui.jsx";

function SecurityChip({ score }) {
  const color = score >= 80 ? "text-emerald-300" : score >= 60 ? "text-amber-300" : "text-rose-300";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Needs Attention" : "At Risk";
  return (
    <div className="card !p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Wallet Safety</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl font-bold ${color}`}>{score}</span>
        <span className="text-sm text-slate-400">/100</span>
      </div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [lockFlash, setLockFlash] = useOutletContext();
  const [wallet, setWallet] = useState(null);
  const [shield, setShield] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [posture, setPosture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, s, a, r, sec] = await Promise.all([
        api.get("/wallet"),
        api.get("/privacy"),
        api.get("/analytics/summary?period=30d"),
        api.get("/transactions?page=1&pageSize=5"),
        api.get("/security/overview"),
      ]);
      setWallet(unwrap(w));
      setShield(unwrap(s));
      setAnalytics(unwrap(a));
      setRecent(unwrap(r) || []);
      setPosture(unwrap(sec)?.posture || null);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleShield = async () => {
    const next = !(shield?.shieldActive && shield?.hideBalance);
    try {
      await api.put("/privacy", { shieldActive: next || shield?.shieldActive, hideBalance: next });
      setShield((p) => ({ ...p, shieldActive: next || p?.shieldActive, hideBalance: next }));
      setLockFlash(next ? "Privacy Shield enabled" : "Privacy Shield disabled");
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const shieldBalance = (shield?.shieldActive && shield?.hideBalance) ? "₹•••••" : inr(wallet?.balance);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400"><div className="text-sm">Loading...</div></div>;
  }

  if (error && !wallet) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <div className="alert-err max-w-md text-center">{error}</div>
        <button className="btn-ghost" onClick={load}>Retry</button>
      </div>
    );
  }

  const name = user?.fullName || user?.firstName
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : user?.username;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${name}.`} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Available Balance</span>
            <button
              onClick={toggleShield}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${shield?.shieldActive && shield?.hideBalance ? "bg-sky-500/15 border-sky-500/30 text-sky-200" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20"}`}
            >
              <span aria-hidden="true">👁</span>
              {shield?.shieldActive && shield?.hideBalance ? "Shield Active" : "Shield Off"}
            </button>
          </div>
          <div className="font-display text-4xl font-bold tracking-tight">{shieldBalance}</div>
          <div className="flex items-center gap-2 text-xs text-slate-400"><span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/70" />{(wallet?.currency || "INR")} · Sandbox</div>
        </div>
        <SecurityChip score={posture?.score ?? 0} />
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">NEXA Intelligence</div>
          <p className="mt-2 text-sm text-slate-300">
            {posture ? `Posture ${posture.score}/100 (${posture.level}). ` : ""}
            {posture?.factors?.[0]?.detail || "Ask NEXA AI about your wallet."}
          </p>
          <Link to="/intelligence" className="mt-2 inline-flex text-xs text-nexa-300 hover:text-nexa-200 underline underline-offset-2">Ask NEXA AI →</Link>
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[{ to: "/send", label: "Send Money", icon: "→", c: "nexa" }, { to: "/add-money", label: "Add Money", icon: "+", c: "emerald" }, { to: "/transactions", label: "Transactions", icon: "📋", c: "sky" }, { to: "/security", label: "Security", icon: "🛡", c: "rose" }, { to: "/analytics", label: "Analytics", icon: "📊", c: "amber" }, { to: "/intelligence", label: "NEXA AI", icon: "✦", c: "purple" }].map((a) => (
            <Link key={a.to} to={a.to} className={`card !p-4 hover:bg-white/[0.07] transition flex items-center gap-3 ${a.c === "nexa" ? "border-l-4 border-nexa-500" : a.c === "emerald" ? "border-l-4 border-emerald-500" : a.c === "rose" ? "border-l-4 border-rose-500" : a.c === "amber" ? "border-l-4 border-amber-500" : "border-l-4 border-sky-500"}`}>
              <span className="text-lg">{a.icon}</span><span className="text-sm font-medium">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}