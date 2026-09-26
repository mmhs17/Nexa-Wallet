import { useEffect, useState, useCallback } from "react"
import { PageHeader, Empty } from "../components/ui.jsx"
import api, { apiError, unwrap } from "../api/client.js"
import { inr, fmtDay } from "../utils/format.js"

const PERIODS = ["7d", "30d", "90d", "1y", "all"]

export default function Analytics() {
  const [period, setPeriod] = useState("30d")
  const [summary, setSummary] = useState(null)
  const [spending, setSpending] = useState(null)
  const [trends, setTrends] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, sp, t, i] = await Promise.all([
        api.get("/analytics/summary?period=" + period),
        api.get("/analytics/spending?period=" + period),
        api.get("/analytics/trends?period=" + period),
        api.get("/analytics/insights?period=" + period),
      ])
      setSummary(unwrap(s)); setSpending(unwrap(sp))
      setTrends(unwrap(t)); setInsights(unwrap(i))
    } catch (e) { setError(apiError(e)) }
    finally { setLoading(false) }
  }, [period])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><div className="text-sm">Loading analytics…</div></div>
  if (error && !summary) return (
    <div className="flex flex-col items-center gap-3 py-20">
      <div className="alert-err max-w-md text-center">{error}</div>
      <button className="btn-ghost" onClick={load}>Retry</button>
    </div>
  )

  const chartData = trends?.items || []
  const totalIn = chartData.reduce((a, c) => a + (Number(c.moneyIn) || 0), 0)
  const totalOut = chartData.reduce((a, c) => a + (Number(c.moneyOut) || 0), 0)
  const maxVal = Math.max(totalIn, totalOut, 1)
  const fm = n => inr(n)
  const pFmt = (v, prev) => prev != null && prev !== 0 ? (v > prev ? "+" : "") + ((v - prev) / prev * 100).toFixed(1) + "% vs prev" : null
  const catPct = (v, prev) => prev != null && prev !== 0 ? (v > prev ? "+" : "") + ((v - prev) / prev * 100).toFixed(1) + "%" : null

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Analytics" subtitle="Understand your money movement patterns." />
      <div className="card !p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${period === p ? "bg-nexa-500/20 text-white border border-nexa-500/40" : "text-slate-400 hover:text-slate-200"}`}>
              {p === "all" ? "All time" : p === "7d" ? "7 days" : p === "30d" ? "30 days" : p === "90d" ? "90 days" : p === "1y" ? "1 year" : p}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Money In</div>
          <div className="mt-1 font-display text-2xl font-bold text-emerald-300">{fm(summary?.moneyIn || 0)}</div>
          <div className="mt-1 text-xs text-slate-400">{pFmt(summary?.moneyIn, summary?.previous?.moneyIn ?? summary?.deltas?.moneyIn?.previous) ?? "—"}</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Money Out</div>
          <div className="mt-1 font-display text-2xl font-bold text-rose-300">{fm(summary?.moneyOut || 0)}</div>
          <div className="mt-1 text-xs text-slate-400">{pFmt(summary?.moneyOut, summary?.previous?.moneyOut ?? summary?.deltas?.moneyOut?.previous) ?? "—"}</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Transactions</div>
          <div className="mt-1 font-display text-2xl font-bold">{summary?.transactionCount || 0}</div>
          <div className="mt-1 text-xs text-slate-400">Avg {fm(summary?.avgTransaction || 0)}</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Net Flow</div>
          <div className="mt-1 font-display text-2xl font-bold" style={{ color: (summary?.net || 0) >= 0 ? "#10b981" : "#f43f5e" }}>
            {(summary?.net || 0) >= 0 ? "+" : ""}{fm(summary?.net)}

          </div>
          <div className="mt-1 text-xs text-slate-400">{summary?.period?.label}</div>
        </div>
      </div>
      <div className="card !p-5">
        <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Income vs Expense</h3>
        {chartData.length === 0 ? <Empty message="Not enough data for trends." /> : (
          <div className="flex flex-col gap-1.5">
            {chartData.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-24 text-right text-xs text-slate-400">{fmtDay(b.bucket)}</div>
                <div className="flex-1 flex gap-1">
                  <div className="h-5 flex-1 rounded bg-emerald-500/20 relative overflow-hidden" style={{ width: Math.max(2, (Number(b.moneyIn) / maxVal) * 100) + "%" }}>
                    {Number(b.moneyIn) > 0 && <span className="absolute inset-0 flex items-center justify-start pl-2 text-[10px] text-emerald-300 font-medium">{fm(b.moneyIn)}</span>}
                  </div>
                  <div className="h-5 flex-1 rounded bg-rose-500/20 relative overflow-hidden" style={{ width: Math.max(2, (Number(b.moneyOut) / maxVal) * 100) + "%" }}>
                    {Number(b.moneyOut) > 0 && <span className="absolute inset-0 flex items-center justify-start pl-2 text-[10px] text-rose-300 font-medium">{fm(b.moneyOut)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500/40" /><span>Income</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-500/40" /><span>Expense</span></div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card !p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Spending by Category</h3>
          {spending?.items?.length === 0 ? <Empty message="No category data yet." /> : (
            <div className="space-y-3">
              {(spending?.items || []).map((c, i) => {
                const pct = c.share ?? (spending.totalOut > 0 ? ((c.total / spending.totalOut) * 100).toFixed(1) : 0)
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="rounded-full w-2.5 h-2.5" style={{ backgroundColor: c.category?.color || "#6366f1" }} />
                        <span className="text-slate-300">{c.category?.name || "Uncategorized"}</span>
                        <span className="text-xs text-slate-500">· {c.count} txn</span>
                      </span>
                      <span className="text-slate-400">{fm(c.total)} ({pct}%)</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: pct + "%", backgroundColor: c.category?.color || "#6366f1" }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="card !p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Largest Transactions</h3>
          {summary?.biggestDebit ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">#1</span>
                  <span className="text-sm text-slate-300">{summary.biggestDebit.type === "SEND" ? "Transfer out" : summary.biggestDebit.type === "WITHDRAW" ? "Withdrawal" : summary.biggestDebit.type}</span>
                  {summary.biggestDebit.counterparty && <span className="text-xs text-slate-500">→ {summary.biggestDebit.counterparty.fullName}</span>}
                </div>
                <span className="text-sm font-display font-bold">-{fm(summary.biggestDebit.amount)}</span>
              </div>
              <p className="text-xs text-slate-500">Largest single debit in the selected period.</p>
            </div>
          ) : (
            <Empty message="No large transactions." />
          )}
        </div>
      </div>
      {insights?.insights?.length > 0 && (
        <div className="card !p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">NEXA Insights</h3>
          <div className="space-y-2">
            {insights.insights.map((ins, i) => (
              <div key={i}
                className={"rounded-xl border p-3 text-sm " +
                  (ins.level === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                   ins.level === "positive" ? "border-emerald-500/30 bg-emerald-500/5" :
                   "border-sky-500/30 bg-sky-500/5")}>
                <div className="font-medium text-slate-200">{ins.title}</div>
                <div className="mt-1 text-slate-400">{ins.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {insights && insights.insights && insights.insights.length === 0 && (
        <div className="card !p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">NEXA Insights</h3>
          <Empty message="No insights for this period yet." />
        </div>
      )}
    </div>
  )
}

