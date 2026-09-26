/**
 * NEXA Wallet — Dedicated Wallet Page
 * Pay Smart. Stay Protected.
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { inr } from "../utils/format.js";
import { PageHeader } from "../components/ui.jsx";

export default function Wallet() {
  const { user } = useAuth();
  const [lockFlash, setLockFlash] = useOutletContext();
  const [wallet, setWallet] = useState(null);
  const [shield, setShield] = useState(null);
  const [recentTxns, setRecentTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, s, txns] = await Promise.all([
        api.get("/wallet"),
        api.get("/privacy"),
        api.get("/transactions?page=1&pageSize=5"),
      ]);
      setWallet(unwrap(w));
      setShield(unwrap(s));
      setRecentTxns(unwrap(txns) || []);
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
      await api.put("/privacy", { 
        shieldActive: next || shield?.shieldActive, 
        hideBalance: next 
      });
      setShield(prev => ({ 
        ...prev, 
        shieldActive: next || prev?.shieldActive, 
        hideBalance: next 
      }));
      setLockFlash(next ? "Privacy Shield enabled" : "Privacy Shield disabled");
    } catch (e) {
      setError(apiError(e));
    }
  };

  const shieldBalance = (shield?.shieldActive && shield?.hideBalance) 
    ? "₹•••••" 
    : inr(wallet?.balance);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Loading wallet...</div>
      </div>
    );
  }

  if (error && !wallet) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <div className="alert-err max-w-md text-center">{error}</div>
        <button className="btn-ghost" onClick={load}>Retry</button>
      </div>
    );
  }

  const name = user?.fullName || user?.username;
  const statusColor = wallet?.status === "FROZEN" ? "text-rose-400" : "text-emerald-400";
  const statusLabel = wallet?.status === "FROZEN" ? "Frozen" : "Active";

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Wallet" 
        subtitle={`Welcome back, ${name}.`} 
      />

      {wallet?.status === "FROZEN" && (
        <div className="alert-err">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h3 className="font-bold text-rose-300">Wallet Frozen</h3>
              <p className="text-sm text-slate-400">
                Your wallet is currently frozen. Visit the Security Center to unlock.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance Card */}
      <div className="card !p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Available Balance
            </p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-4xl font-bold text-white">
                {shieldBalance}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {wallet?.currency || "INR"} · {statusLabel}
            </p>
          </div>
          <button
            onClick={toggleShield}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              shield?.shieldActive && shield?.hideBalance
                ? "bg-sky-500/15 border-sky-500/30 text-sky-200"
                : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20"
            }`}
          >
            <span>👁</span>
            {shield?.shieldActive && shield?.hideBalance ? "Shield Active" : "Shield Off"}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link to="/send" className="card !p-3 !border-white/10 hover:!border-nexa-500/30 transition text-center">
            <div className="text-2xl mb-1">➤</div>
            <div className="text-xs font-medium text-slate-300">Send</div>
          </Link>
          <Link to="/receive" className="card !p-3 !border-white/10 hover:!border-nexa-500/30 transition text-center">
            <div className="text-2xl mb-1">◉</div>
            <div className="text-xs font-medium text-slate-300">Receive</div>
          </Link>
          <Link to="/add-money" className="card !p-3 !border-white/10 hover:!border-nexa-500/30 transition text-center">
            <div className="text-2xl mb-1">+</div>
            <div className="text-xs font-medium text-slate-300">Add Money</div>
          </Link>
          <Link to="/request-money" className="card !p-3 !border-white/10 hover:!border-nexa-500/30 transition text-center">
            <div className="text-2xl mb-1">?</div>
            <div className="text-xs font-medium text-slate-300">Request</div>
          </Link>
        </div>
      </div>

      {/* Wallet Info */}
      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">Wallet Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Wallet ID</span>
            <span className="text-slate-300 font-mono">{user?.nexaId || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Status</span>
            <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Currency</span>
            <span className="text-slate-300">{wallet?.currency || "INR"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Privacy Shield</span>
            <span className="text-slate-300">
              {shield?.shieldActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card !p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-sm font-bold text-white">Recent Transactions</h3>
          <Link to="/transactions" className="text-xs text-sky-400 hover:text-sky-300">
            View all →
          </Link>
        </div>

        {recentTxns.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No transactions yet. Send or receive money to see activity.
          </p>
        ) : (
          <div className="space-y-2">
            {recentTxns.map((txn) => {
              const isCredit = txn.direction === "CREDIT";
              const hidden = shield?.shieldActive && shield?.hideTransactionAmounts;
              return (
                <Link
                  key={txn.id}
                  to={`/transactions/${txn.id}`}
                  className="flex items-center justify-between p-2 rounded hover:bg-white/[0.03] transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm ${
                      isCredit ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                    }`}>
                      {isCredit ? "↑" : "↓"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {txn.category?.name || txn.type || "Transaction"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : ""}
                        {" · "}
                        {txn.counterparty?.fullName || txn.counterparty?.username || txn.description || "NEXA"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`text-sm font-mono ${
                      isCredit ? "text-emerald-300" : "text-rose-300"
                    }`}>
                      {hidden ? "₹•••••" : `${isCredit ? "+" : "-"}${inr(txn.amount)}`}
                    </p>
                    <p className="text-xs text-slate-500">{txn.status}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
