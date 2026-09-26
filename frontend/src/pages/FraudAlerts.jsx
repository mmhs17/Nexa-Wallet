import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { PageHeader, Empty } from "../components/ui.jsx"
import api, { apiError, unwrap } from "../api/client.js"
import { inr, fmtDate, factorLabel } from "../utils/format.js"

export default function FraudAlerts() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [pageSize, setPageSize] = useState(10)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (status) params.set("status", status)
      const r = await api.get("/fraud/alerts?" + params.toString())
      setAlerts({ items: unwrap(r) || [], meta: r?.data?.meta || null, totalPages: r?.data?.meta?.totalPages || 1, total: r?.data?.meta?.total || 0 })
    } catch (e) { setError(apiError(e)) }
    finally { setLoading(false) }
  }, [page, pageSize, status])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><div className="text-sm">Loading fraud alerts…</div></div>
  if (error && !alerts) return (
    <div className="flex flex-col items-center gap-3 py-20">
      <div className="alert-err max-w-md text-center">{error}</div>
      <button className="btn-ghost" onClick={load}>Retry</button>
    </div>
  )

  const levelClass = l => {
    const k = String(l || "").toUpperCase()
    if (k === "HIGH") return "text-rose-300 bg-rose-500/10 border-rose-500/30"
    if (k === "MEDIUM") return "text-amber-300 bg-amber-500/10 border-amber-500/30"
    if (k === "LOW") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
    return "text-slate-400 bg-white/5 border-white/10"
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fraud Alerts"
        subtitle="Review your flagged transactions and fraud alerts."
        actions={
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1) }}
              className="input w-auto text-xs py-1.5"
            >
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="REVIEWING">Reviewing</option>
              <option value="RESOLVED_APPROVED">Resolved (Approved)</option>
              <option value="RESOLVED_REJECTED">Resolved (Rejected)</option>
            </select>
          </div>
        }
      />

      {error && <div className="alert-err max-w-md">{error}</div>}
      <div className="card !p-5">
        {alerts?.items?.length === 0 ? (
          <Empty message={status ? "No alerts match this filter." : "No fraud alerts yet."} />
        ) : (
          <div className="space-y-3">
            {alerts.items.map(a => (
              <div
                key={a.id}
                className="rounded-xl border border-white/5 p-4 hover:bg-white/[0.02] transition cursor-pointer"
                onClick={() => navigate("/transactions/" + a.transactionId)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${levelClass(a.level)}`}>
                        {a.level} · Score {a.score}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">{a.status}</span>
                      {a.reviewedBy && <span className="text-[10px] text-slate-500">reviewed by {typeof a.reviewedBy === "string" ? a.reviewedBy.slice(0, 8) : a.reviewedBy.username || "admin"}</span>}
                    </div>
                    <div className="mt-1.5 text-sm font-medium text-slate-200">
                      {a.reference ? "#" + a.reference : "Transaction"} · {a.type} · {a.transactionStatus}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {inr(a.amount || 0)} {a.currency || "INR"} · score {a.score}/100 ({a.level})
                    </div>
                    {a.factors && a.factors.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.factors.map((f, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            {factorLabel(f)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-400">{fmtDate(a.createdAt)}</div>
                    {a.reviewNote && <div className="mt-0.5 text-xs text-slate-500 italic">"{a.reviewNote}"</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {alerts.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-xs">
            <div className="text-slate-400">{alerts.total} total alerts</div>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost text-[11px] px-2 py-1">← Prev</button>
              <span className="text-slate-400">Page {page} of {alerts.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(alerts.totalPages, p + 1))} disabled={page >= alerts.totalPages} className="btn-ghost text-[11px] px-2 py-1">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

