/**
 * NEXA Wallet — Requests Page
 * Pay Smart. Stay Protected.
 */

import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { inr, fmtDate } from "../utils/format.js";
import { PageHeader, Empty } from "../components/ui.jsx";

const STATUS_STYLES = {
  PENDING: "bg-amber-500/20 text-amber-300",
  ACCEPTED: "bg-emerald-500/20 text-emerald-300",
  REJECTED: "bg-rose-500/20 text-rose-300",
  CANCELLED: "bg-slate-500/20 text-slate-400",
  EXPIRED: "bg-slate-500/20 text-slate-400",
};

export default function Requests() {
  const [lockFlash, setLockFlash] = useOutletContext();
  const [requests, setRequests] = useState([]);
  const [box, setBox] = useState("received");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [recipientUsername, setRecipientUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/requests?box=${box}`);
      setRequests(unwrap(res) || []);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [box]);

  useEffect(() => { load(); }, [load]);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!recipientUsername || !amount) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/requests", {
        to: recipientUsername.replace(/^@/, ""),
        amount: parseFloat(amount),
        note: note || undefined,
      });
      setLockFlash("Payment request sent");
      setShowRequestModal(false);
      setRecipientUsername("");
      setAmount("");
      setNote("");
      if (box !== "sent") setBox("sent");
      else load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (id, action) => {
    setActingId(id);
    setError(null);
    try {
      const res = await api.post(`/requests/${id}/${action}`, {});
      const d = unwrap(res);
      if (action === "accept" && d?.transactionStatus === "UNDER_REVIEW") {
        setLockFlash("Payment accepted — held under NEXA review");
      } else {
        setLockFlash(action === "accept" ? "Request paid" : action === "reject" ? "Request declined" : "Request cancelled");
      }
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Loading requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Requests"
        subtitle="Send and respond to payment requests"
        action={
          <div className="flex gap-2">
            {["received", "sent"].map((b) => (
              <button key={b} onClick={() => setBox(b)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${box === b ? "bg-nexa-500/20 text-white border border-nexa-500/40" : "text-slate-400 hover:text-slate-200"}`}>
                {b === "received" ? "Received" : "Sent"}
              </button>
            ))}
          </div>
        }
      />

      {error && <div className="alert-err">{error}</div>}

      <button onClick={() => setShowRequestModal(true)} className="btn-primary">
        + New Request
      </button>

      <div className="grid gap-4">
        {requests.length === 0 ? (
          <Empty message={box === "sent" ? "No requests sent yet." : "No pending requests to respond to."} />
        ) : (
          requests.map((req) => (
            <div key={req.id} className="card !p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center">
                    <span className="text-xl">📧</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[req.status] || "bg-slate-500/20 text-slate-400"}`}>
                        {req.status}
                      </span>
                      <span className="text-xs text-slate-500">{fmtDate(req.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-200">
                      {req.direction === "INCOMING" ? "From" : "To"}: {req.counterparty?.fullName || req.counterparty?.username || "Unknown"}
                      {req.counterparty?.username ? ` (@${req.counterparty.username})` : ""}
                    </p>
                    <p className="text-lg font-mono font-bold text-white mt-1">{inr(req.amount || 0)}</p>
                    {req.note && <p className="text-xs text-slate-400 mt-1">{req.note}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {req.status === "PENDING" && req.direction === "INCOMING" && (
                    <div className="flex gap-2">
                      <button onClick={() => handleRespond(req.id, "accept")} disabled={actingId === req.id} className="btn-primary text-xs !px-3 !py-1">
                        {actingId === req.id ? "…" : "Accept & Pay"}
                      </button>
                      <button onClick={() => handleRespond(req.id, "reject")} disabled={actingId === req.id} className="btn-ghost text-xs !px-3 !py-1 text-rose-300">
                        Reject
                      </button>
                    </div>
                  )}
                  {req.status === "PENDING" && req.direction === "OUTGOING" && (
                    <button onClick={() => handleRespond(req.id, "cancel")} disabled={actingId === req.id} className="btn-ghost text-xs !px-3 !py-1 text-rose-300">
                      Cancel
                    </button>
                  )}
                  {req.status !== "PENDING" && (
                    <span className="text-xs text-slate-400">
                      {req.status === "ACCEPTED" ? "✓ Paid" : req.status === "REJECTED" ? "✗ Rejected" : req.status === "EXPIRED" ? "Expired" : "Cancelled"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowRequestModal(false)}>
          <div className="card !p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-white mb-4">Request Money</h3>
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Recipient</label>
                <input type="text" value={recipientUsername} onChange={(e) => setRecipientUsername(e.target.value)}
                  placeholder="Username, email, phone or NEXA ID" className="input w-full" required />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Amount (₹)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount" className="input w-full" min="1" step="0.01" required />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="input w-full" rows="2" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowRequestModal(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? "Sending..." : "Send Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
