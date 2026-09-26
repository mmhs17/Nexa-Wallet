/**
 * NEXA Wallet — shared demo test directory.
 * Real identifiers from the local database shown alongside the real
 * logged-in user, so Send Money / Requests / Beneficiaries stay fillable
 * without typing blind. Read-only; safe on every screen.
 */

import { useMemo, useState } from "react";
import api, { unwrap } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

export const DEMO_PEERS = [
  { username: "p11ab0jwzv", nexaId: "NEXA-HSPW5", email: "p11ab0jwzv@nexa.test", label: "Phase11 A (sender)" },
  { username: "p11bb0jwzv", nexaId: "NEXA-XE648", email: "p11bb0jwzv@nexa.test", label: "Phase11 B (receiver)" },
  { username: "p11a8fwsew", nexaId: "NEXA-3XYFL", email: "p11a8fwsew@nexa.test", label: "Phase11 A (older pair)" },
  { username: "p11b8fwsew", nexaId: "NEXA-KB4MA", email: "p11b8fwsew@nexa.test", label: "Phase11 B (older pair)" },
];

export const DEMO_TXNS = [
  { reference: "NEXA-TXN-2026-7VACQBV", detail: "ADD_MONEY · ₹5000 · COMPLETED" },
  { reference: "NEXA-TXN-2026-XTHDKJH", detail: "SEND · ₹250 · COMPLETED" },
  { reference: "NEXA-TXN-2026-GWPRGQD", detail: "ADD_MONEY · ₹100 · COMPLETED" },
];

/**
 * Small "Test Directory" card for the Send Money flow: a live directory of
 * the current user (for copy/share) + clickable demo users to fill the
 * recipient box, plus recent real transaction references to look up.
 */
export default function DemoDirectory({ onPickIdentifier, title = "Test Directory" }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState("");

  const peers = useMemo(
    () => DEMO_PEERS.filter((p) => p.username !== user?.username),
    [user?.username]
  );

  const copy = async (text, label) => {
    try {
      await navigator.clipboard?.writeText(text || "");
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };

  return (
    <div className="card !p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-white">{title}</h3>
        {copied && <span className="text-xs text-emerald-300">{copied} copied</span>}
      </div>

      {/* Your own identifiers */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs">
        <div className="mb-2 font-semibold uppercase tracking-wider text-slate-400">Your receiving details</div>
        <div className="space-y-1 font-mono text-slate-200">
          <div>username: {user?.username || "—"}</div>
          <div>NEXA ID: {user?.nexaId || "—"}</div>
          <div className="break-all">email: {user?.email || "—"}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => copy(user?.username, "username")}>Copy username</button>
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => copy(user?.nexaId, "NEXA ID")}>Copy NEXA ID</button>
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => copy(user?.email, "email")}>Copy email</button>
        </div>
      </div>

      {/* Real demo peers */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Real demo users — click to fill
        </div>
        <div className="space-y-2">
          {peers.map((p) => (
            <button
              key={p.username}
              type="button"
              onClick={() => onPickIdentifier?.(p.username)}
              className="block w-full rounded-lg border border-white/10 bg-white/[0.02] p-2 text-left transition hover:border-nexa-500/40 hover:bg-white/[0.05]"
              title={`Fill recipient with ${p.username}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-200">{p.label}</span>
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{p.nexaId}</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">
                @{p.username} · {p.email}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Real transaction references */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Real transaction IDs — click to copy
        </div>
        <div className="space-y-2">
          {DEMO_TXNS.map((t) => (
            <button
              key={t.reference}
              type="button"
              onClick={() => copy(t.reference, "Transaction ID")}
              className="block w-full rounded-lg border border-white/10 bg-white/[0.02] p-2 text-left transition hover:border-nexa-500/40 hover:bg-white/[0.05]"
              title="Copy transaction reference"
            >
              <div className="font-mono text-xs text-nexa-300">{t.reference}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{t.detail}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Paste a reference into Transactions → search, or open it on the detail page.
        </p>
      </div>
    </div>
  );
}

/** Resolve any username/email/NEXA ID via the real backend route (for tests). */
export async function resolveIdentifier(q) {
  const res = await api.get("/wallet/recipients/resolve?q=" + encodeURIComponent(q));
  return unwrap(res);
}
