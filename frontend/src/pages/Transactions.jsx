import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { inr, fmtDate, riskBadge, statusBadge } from "../utils/format.js";
import { PageHeader, Empty } from "../components/ui.jsx";

const STATUSES = ["COMPLETED", "PENDING", "UNDER_REVIEW", "BLOCKED", "FAILED", "REVERSED"];
const CATEGORIES_API = "/wallet/categories";

export default function Transactions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: "", status: "", direction: "", categoryId: "", search: "",
    from: "", to: "", minAmount: "", maxAmount: "", sortBy: "createdAt", sortOrder: "desc",
  });
  const [pageSize, setPageSize] = useState(20);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/wallet/categories").then((r) => setCategories(unwrap(r) || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await api.get("/transactions?" + params.toString());
      setData({ items: unwrap(res) || [], meta: res?.data?.meta || null });
    } catch (e) { setError(apiError(e)); }
    finally { setLoading(false); }
  }, [filters, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><div className="text-sm">Loading transactions…</div></div>;
  if (error && !data) return <div className="flex flex-col items-center gap-3 py-20"><div className="alert-err max-w-md text-center">{error}</div><button className="btn-ghost" onClick={load}>Retry</button></div>;

  const { items: txns, meta } = data || {};

  return (
    <div className="space-y-5">
      <PageHeader title="Transactions" subtitle="Your complete payment history." />

      <div className="card !p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select className="input" value={filters.status} onChange={e => setFilter("status", e.target.value)}
            disabled={loading}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" value={filters.direction} onChange={e => setFilter("direction", e.target.value)}
            disabled={loading}>
            <option value="">Credits + Debits</option>
            <option value="CREDIT">Credits</option>
            <option value="DEBIT">Debits</option>
          </select>
          <select className="input" value={filters.categoryId} onChange={e => setFilter("categoryId", e.target.value)}
            disabled={loading}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" placeholder="Search ref / note…" value={filters.search}
            onChange={e => setFilter("search", e.target.value)} disabled={loading} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="input" type="date" value={filters.from} onChange={e => setFilter("from", e.target.value)} disabled={loading} />
          <input className="input" type="date" value={filters.to} onChange={e => setFilter("to", e.target.value)} disabled={loading} />
          <select className="input" value={filters.sortBy + ":" + filters.sortOrder} onChange={e => { const [sb, so] = e.target.value.split(":"); setFilters(f => ({ ...f, sortBy: sb, sortOrder: so })); setPage(1); }} disabled={loading}>
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="amount:desc">Largest amount</option>
            <option value="amount:asc">Smallest amount</option>
          </select>
          <select className="input" value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} disabled={loading}>
            <option value="10">10 / page</option>
            <option value="20">20 / page</option>
            <option value="50">50 / page</option>
          </select>
        </div>
      </div>

      {error && <div className="alert-err max-w-md">{error}</div>}

      {!txns || txns.length === 0 ? (
        <Empty message="No transactions match your filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Date</th>
                <th>Type</th>
                <th>Counterparty</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition">
                  <td className="font-mono text-xs text-slate-400">
                    <Link to={"/transactions/" + t.id} className="hover:text-nexa-300 hover:underline">{t.reference || t.id.slice(0, 8)}</Link>
                  </td>
                  <td className="text-xs text-slate-400">{fmtDate(t.createdAt)}</td>
                  <td><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.direction === "CREDIT" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-rose-500/15 text-rose-300 border-rose-500/30"}`}>{t.direction}</span></td>
                  <td>
                    <div className="font-medium text-sm">{t.counterparty?.fullName || t.counterparty?.username || t.note || t.type}</div>
                    <div className="text-xs text-slate-400">{t.category?.name ? t.category.name + " · " : ""}{t.counterparty ? `@${t.counterparty.username}` : ""}</div>
                  </td>
                  <td className="text-right font-display font-bold text-sm">
                    {t.direction === "CREDIT" ? "+" : "−"}{inr(t.amount)}
                  </td>
                  <td><span className={statusBadge(t.status)}>{t.status}</span></td>
                  <td>{t.risk && <span className={riskBadge(t.risk.level)}>{t.risk.level} {t.risk.score}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Page {meta.page} of {meta.totalPages} ({meta.total} total)</span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-ghost" disabled={meta.totalPages && page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
