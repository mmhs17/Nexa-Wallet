/**
 * NEXA Wallet — Request Money Page
 * Pay Smart. Stay Protected.
 */

import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { inr } from "../utils/format.js";
import { PageHeader } from "../components/ui.jsx";

export default function RequestMoney() {
  const [lockFlash, setLockFlash] = useOutletContext();
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqRes, sentRes] = await Promise.all([
        api.get("/requests?box=received"),
        api.get("/requests?box=sent"),
      ]);
      setReceivedRequests(unwrap(reqRes) || []);
      setSentRequests(unwrap(sentRes) || []);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRespond = async (id, action) => {
    setSubmitting(id);
    try {
      await api.post(`/requests/${id}/${action}`, {});
      setLockFlash(`Request ${action}`);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Request Money"
        subtitle="Track payment requests"
      />

      {/* Receive Requests */}
      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">Payment Requests Received</h3>

        {receivedRequests.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No payment requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {receivedRequests.map((req) => (
              <div key={req.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        req.status === "PENDING" ? "bg-amber-500/20 text-amber-300" :
                        req.status === "ACCEPTED" ? "bg-emerald-500/20 text-emerald-300" :
                        req.status === "REJECTED" ? "bg-rose-500/20 text-rose-300" :
                        "bg-slate-500/20 text-slate-400"
                      }`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-200">
                      {req.amount ? inr(req.amount) : "₹0"}
                    </p>
                    {req.note && <p className="text-xs text-slate-400 mt-1">{req.note}</p>}
                  </div>

                  {req.status === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRespond(req.id, "accept")}
                        disabled={submitting === req.id}
                        className="btn-primary text-xs !px-3 !py-1"
                      >
                        {submitting === req.id ? "..." : "Accept"}
                      </button>
                      <button
                        onClick={() => handleRespond(req.id, "reject")}
                        disabled={submitting === req.id}
                        className="btn-ghost text-xs !px-3 !py-1 text-rose-300"
                      >
                        {submitting === req.id ? "..." : "Reject"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent Requests */}
      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">Payment Requests Sent</h3>

        {sentRequests.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No payment requests sent yet.
          </p>
        ) : (
          <div className="space-y-3">
            {sentRequests.map((req) => (
              <div key={req.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {req.amount ? inr(req.amount) : "₹0"}
                    </p>
                    {req.note && <p className="text-xs text-slate-400 mt-1">{req.note}</p>}
                    <p className="text-xs text-slate-500 mt-1">
                      To: {req.counterparty?.username || req.counterparty?.fullName || "Unknown"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Cancel this request?")) {
                        api.post(`/requests/${req.id}/cancel`, {})
                          .then(() => { setLockFlash("Request cancelled"); load(); })
                          .catch(e => setError(apiError(e)));
                      }
                    }}
                    className="btn-ghost text-xs !px-3 !py-1 text-rose-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">How Request Money Works</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">1</div>
            <div>
              <p className="font-medium text-slate-200">Create a request</p>
              <p className="text-slate-400">Enter the recipient's details and the amount you want them to pay.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">2</div>
            <div>
              <p className="font-medium text-slate-200">They receive notification</p>
              <p className="text-slate-400">The recipient gets a notification about your payment request.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">3</div>
            <div>
              <p className="font-medium text-slate-200">They accept or reject</p>
              <p className="text-slate-400">The recipient can accept to send the money or reject the request.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
