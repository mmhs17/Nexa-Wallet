/**
 * NEXA Wallet — Recurring Payments Page
 * Pay Smart. Stay Protected.
 */

import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { inr, fmtDate } from "../utils/format.js";
import { PageHeader, Empty, Field } from "../components/ui.jsx";

const FREQUENCIES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

const STATUS_STYLES = {
  ACTIVE: "bg-emerald-500/20 text-emerald-300",
  PAUSED: "bg-amber-500/20 text-amber-300",
  CANCELLED: "bg-slate-500/20 text-slate-400",
  COMPLETED: "bg-sky-500/20 text-sky-300",
};

export default function RecurringPayments() {
  const [lockFlash, setLockFlash] = useOutletContext();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/recurring-payments");
      setSchedules(unwrap(res) || []);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!recipient || !amount) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/recurring-payments", {
        to: recipient.replace(/^@/, ""),
        amount: parseFloat(amount),
        frequency,
        note: note || undefined,
      });
      setLockFlash("Recurring payment scheduled");
      setShowModal(false);
      setRecipient("");
      setAmount("");
      setFrequency("MONTHLY");
      setNote("");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id, action) => {
    setActingId(id);
    setError(null);
    try {
      if (action === "delete") {
        await api.delete(`/recurring-payments/${id}`);
        setLockFlash("Recurring payment deleted");
      } else {
        await api.post(`/recurring-payments/${id}/${action}`, {});
        setLockFlash(action === "pause" ? "Recurring payment paused" : "Recurring payment resumed");
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
        <div className="text-sm text-slate-400">Loading recurring payments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring Payments"
        subtitle="Automate scheduled transfers to people you trust"
        action={
          <button onClick={() => setShowModal(true)} className="btn-primary">
            + New Schedule
          </button>
        }
      />

      {error && <div className="alert-err">{error}</div>}

      {schedules.length === 0 ? (
        <Empty message="No recurring payments yet. Create a schedule to send money automatically." />
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="card !p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-nexa-500/20 text-lg text-nexa-300">
                    ↻
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate font-medium text-white">
                        {s.recipient?.fullName || s.recipient?.username || "Unknown recipient"}
                      </h4>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_STYLES[s.status] || "bg-slate-500/20 text-slate-400"
                      }`}>
                        {s.status}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-400">
                        {s.frequencyLabel || s.frequency}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold text-white">{inr(s.amount)}</p>
                    {s.recipient?.username && (
                      <p className="text-xs text-slate-500">@{s.recipient.username}</p>
                    )}
                    {s.note && <p className="mt-1 text-xs text-slate-400">{s.note}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      Next run: {fmtDate(s.nextRunAt)}
                      {s.lastRunAt ? ` · Last run: ${fmtDate(s.lastRunAt)}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {s.status === "ACTIVE" && (
                    <button
                      onClick={() => handleAction(s.id, "pause")}
                      disabled={actingId === s.id}
                      className="btn-ghost text-xs !px-3 !py-1"
                    >
                      {actingId === s.id ? "…" : "Pause"}
                    </button>
                  )}
                  {s.status === "PAUSED" && (
                    <button
                      onClick={() => handleAction(s.id, "resume")}
                      disabled={actingId === s.id}
                      className="btn-primary text-xs !px-3 !py-1"
                    >
                      {actingId === s.id ? "…" : "Resume"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("Delete this recurring payment?")) handleAction(s.id, "delete");
                    }}
                    disabled={actingId === s.id}
                    className="btn-ghost text-xs !px-3 !py-1 text-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}


      {/* New Schedule Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="card !p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-white mb-4">New Recurring Payment</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Recipient">
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Username, email, phone or NEXA ID"
                  className="input w-full"
                  required
                />
              </Field>

              <Field label="Amount (₹)">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  className="input w-full"
                  min="1"
                  max="500000"
                  step="0.01"
                  required
                />
              </Field>

              <Field label="Frequency">
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="input w-full"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f.charAt(0) + f.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Note (optional)">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note..."
                  className="input w-full"
                  rows="2"
                />
              </Field>

              <p className="text-xs text-slate-500">
                The recipient must be a NEXA user. Funds move only when the schedule runs — you can pause it anytime.
              </p>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? "Scheduling..." : "Create Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

