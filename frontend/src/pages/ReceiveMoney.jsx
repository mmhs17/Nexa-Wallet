/**
 * NEXA Wallet — Receive Money Page
 * Pay Smart. Stay Protected.
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { inr } from "../utils/format.js";
import { PageHeader } from "../components/ui.jsx";
import DemoDirectory from "../components/DemoDirectory.jsx";

export default function ReceiveMoney() {
  const { user } = useAuth();
  const [lockFlash, setLockFlash] = useOutletContext();
  const [wallet, setWallet] = useState(null);
  const [shield, setShield] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, s] = await Promise.all([
        api.get("/wallet"),
        api.get("/privacy"),
      ]);
      setWallet(unwrap(w));
      setShield(unwrap(s));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Loading...</div>
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

  const nexaId = user?.nexaId;
  const username = user?.username;
  const email = user?.email;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Receive Money" 
        subtitle="Share your details to receive payments"
      />

      {wallet?.status === "FROZEN" && (
        <div className="alert-err">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h3 className="font-bold text-rose-300">Wallet Frozen</h3>
              <p className="text-sm text-slate-400">
                You cannot receive money while your wallet is frozen.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Copyable receiving details */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* NEXA ID */}
        <div className="card !p-6">
          <h3 className="font-display text-lg font-bold text-white mb-4">Your NEXA ID</h3>
          <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
            <div className="text-xs text-slate-400 mb-2">Share this ID to get paid</div>
            <div className="font-mono text-xl font-bold text-nexa-300 break-all">
              {nexaId || "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(nexaId || "");
              setLockFlash("NEXA ID copied to clipboard");
            }}
            className="mt-3 btn-ghost text-sm w-full"
          >
            Copy NEXA ID
          </button>
        </div>

        {/* Username */}
        <div className="card !p-6">
          <h3 className="font-display text-lg font-bold text-white mb-4">Username</h3>
          <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
            <div className="text-xs text-slate-400 mb-2">@username</div>
            <div className="font-mono text-xl font-bold text-white break-all">
              @{username || "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(`@${username || ""}`);
              setLockFlash("Username copied to clipboard");
            }}
            className="mt-3 btn-ghost text-sm w-full"
          >
            Copy Username
          </button>
        </div>

        {/* Email */}
        <div className="card !p-6">
          <h3 className="font-display text-lg font-bold text-white mb-4">Email</h3>
          <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
            <div className="text-xs text-slate-400 mb-2">Registered email</div>
            <div className="font-mono text-base font-bold text-white break-all">
              {email || "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(email || "");
              setLockFlash("Email copied to clipboard");
            }}
            className="mt-3 btn-ghost text-sm w-full"
          >
            Copy Email
          </button>
        </div>
      <DemoDirectory title="Test Senders & Transaction IDs" />
      </div>

      {/* Balance */}
      <div className="card !p-6">
        <h3 className="font-display text-sm font-bold text-white mb-3">Wallet Balance</h3>
        <div className="bg-white/[0.03] rounded-lg p-4 border border-white/10">
          <div className="text-xs text-slate-400 mb-2">Available to receive</div>
          <div className="font-mono text-2xl font-bold text-white">
            {shield?.shieldActive && shield?.hideBalance ? "₹•••••" : inr(wallet?.balance)}
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Currency: {wallet?.currency || "INR"}
        </div>
      </div>

      {/* How to Receive */}
      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">How to Receive Money</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 shrink-0 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">1</div>
            <div>
              <p className="font-medium text-slate-200">Share your NEXA ID</p>
              <p className="text-slate-400">Send your NEXA Wallet ID to the person who wants to pay you.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 shrink-0 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">2</div>
            <div>
              <p className="font-medium text-slate-200">Or share your @username</p>
              <p className="text-slate-400">Anyone on NEXA can send money straight to your username.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 shrink-0 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">3</div>
            <div>
              <p className="font-medium text-slate-200">Money arrives instantly</p>
              <p className="text-slate-400">Credits land in your wallet immediately once the sender confirms.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Shield note */}
      <div className="card !p-4 !border-sky-500/20 bg-sky-500/5">
        <div className="flex items-start gap-3">
          <span className="text-xl">👁</span>
          <div>
            <h4 className="font-medium text-sky-300">
              {shield?.shieldActive ? "Privacy Shield Active" : "Privacy Shield Off"}
            </h4>
            <p className="text-sm text-slate-400 mt-1">
              {shield?.shieldActive && shield?.hideBalance
                ? "Your balance is hidden on this screen. Your NEXA ID is still safe to share."
                : "Your balance is visible on this screen. Enable Privacy Shield to mask it."}
            </p>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap gap-3">
        <Link to="/request-money" className="btn-primary">Request Money</Link>
        <Link to="/transactions" className="btn-ghost">View Transactions</Link>
      </div>
    </div>
  );
}
