import { useEffect, useState, useCallback } from "react"
import { PageHeader, Empty } from "../components/ui.jsx"
import api, { apiError, unwrap } from "../api/client.js"
import { inr, fmtDate } from "../utils/format.js"

export default function Admin() {
  const [stats, setStats] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [auditLogs, setAuditLogs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [alertsPage, setAlertsPage] = useState(1)
  const [actionMsg, setActionMsg] = useState(null)
  const [actingId, setActingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, a, al] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/alerts?page=" + alertsPage + "&pageSize=10"),
        api.get("/admin/audit-logs?page=" + page + "&pageSize=10"),
      ])
      setStats(unwrap(s))
      const aItems = unwrap(a) || []
      setAlerts({ items: aItems, total: a?.data?.meta?.total || 0, totalPages: a?.data?.meta?.totalPages || 1 })
      const alItems = unwrap(al) || []
      setAuditLogs({ items: alItems, total: al?.data?.meta?.total || 0, totalPages: al?.data?.meta?.totalPages || 1 })
    } catch (e) { setError(apiError(e)) }
    finally { setLoading(false) }
  }, [page, alertsPage])

  const claim = async (id) => {
    setActingId(id); setActionMsg(null)
    try {
      await api.post("/admin/alerts/" + id + "/claim", {})
      setActionMsg("Alert claimed — now REVIEWING.")
      load()
    } catch (e) { setActionMsg(apiError(e)) }
    finally { setActingId(null) }
  };

  const resolve = async (id, decision) => {
    const note = window.prompt(decision === "APPROVE" ? "Approval note (optional):" : "Rejection reason (optional):", "");
    if (note === null) return;
    setActingId(id); setActionMsg(null)
    try {
      const r = await api.post("/admin/alerts/" + id + "/resolve", { decision, note: note || undefined });
      setActionMsg("Alert " + decision.toLowerCase() + "d — txn " + (unwrap(r)?.transactionStatus || ""));
      load()
    } catch (e) { setActionMsg(apiError(e)) }
    finally { setActingId(null) }
  };

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><div className="text-sm">Loading admin dashboard…</div></div>
  if (error && !stats) return (
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
      <PageHeader title="Admin Command Center" subtitle="NEXA Wallet — Fraud review queue and audit trail." />
      {error && <div className="alert-err max-w-md">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Open Alerts</div>
          <div className="mt-1 font-display text-2xl font-bold text-rose-300">{stats?.openAlerts ?? 0}</div>
          <div className="mt-1 text-xs text-slate-400">Awaiting review</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Under Review</div>
          <div className="mt-1 font-display text-2xl font-bold text-amber-300">{stats?.reviewingAlerts ?? 0}</div>
          <div className="mt-1 text-xs text-slate-400">Assigned to reviewers</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Blocked Txns</div>
          <div className="mt-1 font-display text-2xl font-bold text-rose-300">{stats?.blockedTxns ?? 0}</div>
          <div className="mt-1 text-xs text-slate-400">High-risk payments stopped</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Alerts</div>
          <div className="mt-1 font-display text-2xl font-bold">{(stats?.openAlerts ?? 0) + (stats?.reviewingAlerts ?? 0) + (stats?.resolvedAlerts ?? 0)}</div>
          <div className="mt-1 text-xs text-slate-400">All time</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card !p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fraud Alerts</h3>
            <a href="/fraud/alerts" className="text-xs text-nexa-400 hover:text-nexa-300">View all →</a>
          </div>
          {alerts?.items?.length === 0 ? (
            <Empty message="No fraud alerts." />
          ) : (
            <div className="space-y-3">
              {alerts.items.map(a => (
                <div key={a.id} className="rounded-xl border border-white/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${levelClass(a.level)}`}>
                          {a.level}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">{a.status}</span>
                        {a.reviewedBy && <span className="text-[10px] text-slate-500">by {a.reviewedBy.username}</span>}
                      </div>
                      <div className="mt-1.5 text-sm font-medium text-slate-200 truncate">
                        {a.alertType ?? a.type ?? "Alert"} · {inr(a.amount || 0)} {a.currency || "INR"}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{a.reference ? "#" + a.reference : ""} {a.sender ? "from " + a.sender.fullName : ""} {a.receiver ? "to " + a.receiver.fullName : ""}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">{fmtDate(a.createdAt)}</div>
                      {a.score != null && <div className="text-xs text-slate-500">Score: {a.score}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {alerts.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-xs">
              <div className="text-slate-400">Page {alertsPage} of {alerts.totalPages}</div>
              <div className="flex gap-2">
                <button onClick={() => setAlertsPage(p => Math.max(1, p - 1))} disabled={alertsPage <= 1} className="btn-ghost text-[11px] px-2 py-1">← Prev</button>
                <button onClick={() => setAlertsPage(p => Math.min(alerts.totalPages, p + 1))} disabled={alertsPage >= alerts.totalPages} className="btn-ghost text-[11px] px-2 py-1">Next →</button>
              </div>
            </div>
          )}
        </div>
        <div className="card !p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Audit Log</h3>
            <a href="/admin/audit-logs" className="text-xs text-nexa-400 hover:text-nexa-300">View all →</a>
          </div>
          {auditLogs?.items?.length === 0 ? (
            <Empty message="No audit entries." />
          ) : (
            <div className="space-y-2">
              {auditLogs.items.map(a => (
                <div key={a.id} className="rounded-xl border border-white/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">{a.actorRole}</span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">{a.action}</span>
                        <span className={`text-[10px] font-semibold ${a.result === "SUCCESS" ? "text-emerald-300" : a.result === "FAILURE" ? "text-rose-300" : "text-slate-400"}`}>
                          {a.result}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400 truncate">{a.entity} · {a.action.replace(/_/g, " ")}</div>
                      {a.actor && <div className="text-xs text-slate-500">by {a.actor.username}</div>}
                    </div>
                    <div className="text-right shrink-0 text-xs text-slate-400">{fmtDate(a.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {auditLogs.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-xs">
              <div className="text-slate-400">Page {page} of {auditLogs.totalPages}</div>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost text-[11px] px-2 py-1">← Prev</button>
                <button onClick={() => setPage(p => Math.min(auditLogs.totalPages, p + 1))} disabled={page >= auditLogs.totalPages} className="btn-ghost text-[11px] px-2 py-1">Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

