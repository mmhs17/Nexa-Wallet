/**
 * NEXA Wallet — Beneficiaries Page
 * Pay Smart. Stay Protected.
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { fmtDate } from "../utils/format.js";
import { PageHeader, Empty } from "../components/ui.jsx";

export default function Beneficiaries() {
  const [lockFlash, setLockFlash] = useOutletContext();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const [identifier, setIdentifier] = useState("");
  const [nickname, setNickname] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editNickname, setEditNickname] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/beneficiaries");
      setBeneficiaries(unwrap(res) || []);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!identifier) return;
    setSavingId("add");
    setError(null);
    try {
      await api.post("/beneficiaries", { identifier, nickname: nickname || undefined });
      setLockFlash("Beneficiary saved");
      setIdentifier("");
      setNickname("");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSavingId(null);
    }
  };

  const handleEdit = async (id) => {
    if (!editNickname) return;
    setSavingId(id);
    setError(null);
    try {
      await api.put(`/beneficiaries/${id}`, { nickname: editNickname });
      setLockFlash("Beneficiary updated");
      setEditingId(null);
      setEditNickname("");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSavingId(null);
    }
  };

  const toggleFavorite = async (b) => {
    setSavingId(b.id);
    setError(null);
    try {
      await api.put(`/beneficiaries/${b.id}`, { isFavorite: !b.isFavorite });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this beneficiary?")) return;
    setError(null);
    try {
      await api.delete(`/beneficiaries/${id}`);
      setLockFlash("Beneficiary removed");
      load();
    } catch (e) {
      setError(apiError(e));
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
      <PageHeader title="Beneficiaries" subtitle="People you pay often — saved for one-tap transfers." />

      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-4">Add Beneficiary</h3>
        <form onSubmit={handleAdd} className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Recipient</label>
            <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username, email, phone or NEXA ID" className="input w-full" required />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nickname (optional)</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Landlord" className="input w-full" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={savingId === "add"} className="btn-primary w-full">
              {savingId === "add" ? "Saving…" : "Add Beneficiary"}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="alert-err">{error}</div>}

      <div className="grid gap-3">
        {beneficiaries.length === 0 ? (
          <Empty message="No beneficiaries yet. Add someone you pay often." />
        ) : (
          beneficiaries.map((b) => (
            <div key={b.id} className="card !p-4">
              {editingId === b.id ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={editNickname} onChange={(e) => setEditNickname(e.target.value)}
                    placeholder="Nickname" className="input flex-1" autoFocus />
                  <button onClick={() => handleEdit(b.id)} disabled={savingId === b.id} className="btn-primary text-xs !px-3">Save</button>
                  <button onClick={() => { setEditingId(null); setEditNickname(""); }} className="btn-ghost text-xs !px-3">Cancel</button>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-nexa-500/20 flex items-center justify-center">
                      <span className="text-lg">👤</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-white">{b.nickname || b.displayName}</h4>
                        {b.isFavorite && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">★ Favorite</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">@{b.handle}</p>
                      <p className="text-xs text-slate-500">
                        {b.transactionCount} transfer{b.transactionCount === 1 ? "" : "s"}
                        {b.lastTransactionAt ? ` · last ${fmtDate(b.lastTransactionAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleFavorite(b)} disabled={savingId === b.id} className="btn-ghost text-xs !px-3">
                      {b.isFavorite ? "Unstar" : "Star"}
                    </button>
                    <button onClick={() => { setEditingId(b.id); setEditNickname(b.nickname || b.displayName); }} className="btn-ghost text-xs !px-3">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(b.id)} className="btn-ghost text-xs !px-3 !text-rose-300">
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card !p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">About Beneficiaries</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">1</div>
            <div>
              <p className="font-medium text-slate-200">Saved payees speed up transfers</p>
              <p className="text-slate-400">The fraud engine uses beneficiary history to lower risk scores on repeat payments.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">2</div>
            <div>
              <p className="font-medium text-slate-200">Star your favorites</p>
              <p className="text-slate-400">Favorites float to the top of the list for quick access.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-nexa-500/20 text-nexa-300 flex items-center justify-center text-xs font-bold">3</div>
            <div>
              <p className="font-medium text-slate-200">Privacy Shield respected</p>
              <p className="text-slate-400">Shielded users are only discoverable by existing payees — adding someone requires their handle.</p>
            </div>
          </div>
        </div>
      </div>

      <Link to="/send" className="btn-primary inline-block">Send Money →</Link>
    </div>
  );
}
