import { useEffect, useState, useRef, useCallback } from "react"
import { PageHeader, Empty } from "../components/ui.jsx"
import api, { apiError, unwrap } from "../api/client.js"
import { inr, fmtDate } from "../utils/format.js"

export default function Intelligence() {
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState([])
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  const loadContext = useCallback(async () => {
    try {
      const r = await api.get("/intelligence/context")
      setContext(unwrap(r))
    } catch (e) { setError(apiError(e)) }
  }, [])

  const send = useCallback(async () => {
    const msg = message.trim()
    if (!msg || sending) return
    setSending(true); setError(null)
    const id = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : String(Date.now())
    setHistory(h => [...h, { id, role: "user", content: msg, ts: new Date() }])
    setMessage("")
    try {
      const r = await api.post("/intelligence/chat", { message: msg })
      const data = unwrap(r)
      setHistory(h => [...h, { id, role: "assistant", content: data.reply, ts: new Date(), model: data.model, usage: data.usage }])
    } catch (e) {
      setHistory(h => [...h, { id, role: "error", content: apiError(e), ts: new Date() }])
    } finally {
      setSending(false)
    }
  }, [message, sending])

  useEffect(() => { loadContext() }, [loadContext])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history])

  const wallet = context?.wallet
  const user = context?.user
  const recentTxns = context?.recentTransactions || []
  const openAlerts = context?.openAlerts || []
  const avgRisk = recentTxns.length > 0 ? (recentTxns.reduce((a, t) => a + (t.riskScore || 0), 0) / recentTxns.length).toFixed(1) : null

  return (
    <div className="space-y-6">
      <PageHeader title="NEXA Intelligence" subtitle="Ask questions about your wallet — grounded in your own data." />
      {error && <div className="alert-err max-w-md">{error}</div>}
      {context ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="card !p-5">
                <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1" ref={scrollRef}>
                  {history.length === 0 && (
                    <div className="text-sm text-slate-400 py-4 text-center">
                      Ask about your balance, recent transactions, spending patterns, fraud alerts, security posture, or anything else about your NEXA Wallet.
                    </div>
                  )}
                  {history.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                        msg.role === "user" ? "bg-nexa-500/20 text-white rounded-br-md" :
                        msg.role === "error" ? "bg-rose-500/10 text-rose-300 rounded-br-md border border-rose-500/20" :
                        "bg-white/5 text-slate-200 rounded-bl-md"
                      }`}>
                        {msg.content}
                        {msg.model && msg.role === "assistant" && (
                          <div className="mt-1.5 text-[10px] text-slate-500 tracking-wide">{msg.model}{msg.usage ? " · " + msg.usage.totalTokens + " tokens" : ""}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 rounded-xl rounded-bl-md px-4 py-2.5 text-sm text-slate-400">Thinking…</div>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Ask about your wallet…"
                    disabled={sending}
                    className="input flex-1"
                  />
                  <button onClick={send} disabled={sending || !message.trim()} className="btn-primary disabled:opacity-40">
                    {sending ? "Sending…" : "Ask"}
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="card !p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Your Wallet</h3>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-400">Balance</span>
                  <span className="font-display text-lg font-bold">{inr(wallet?.balance)}</span>
                </div>


                {wallet?.pendingBalance != null && (
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-[11px] text-slate-400">Pending</span>
                    <span className="text-sm text-slate-400">{inr(wallet.pendingBalance)}</span>
                  </div>
                )}
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-400">Status</span>
                  <span className="text-xs text-slate-400 capitalize">{wallet?.status?.toLowerCase()}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-400">2FA</span>
                  <span className="text-xs text-slate-400">{context.twoFactor?.enabled ? "Enabled" : "Not enabled"}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-400">Privacy Shield</span>
                  <span className="text-xs text-slate-400">{context.privacy?.shieldActive ? "Active" : "Inactive"}</span>
                </div>
                {avgRisk != null && (
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[11px] text-slate-400">Avg Risk (30d)</span>
                    <span className="text-xs font-semibold">{avgRisk}/100</span>
                  </div>
                )}
              </div>
              <div className="card !p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Open Alerts</h3>
                {openAlerts.length === 0 ? (
                  <div className="text-xs text-slate-400">No open fraud alerts.</div>
                ) : (
                  <div className="space-y-2">
                    {openAlerts.slice(0, 3).map((a, i) => (
                      <div key={i} className="text-xs text-slate-400 flex items-center justify-between">
                        <span>{a.alertType}</span>
                        <span className="text-rose-300">{a.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {recentTxns.length > 0 && (
                <div className="card !p-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Recent Activity</h3>
                  <div className="space-y-2">
                    {recentTxns.slice(0, 5).map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold ${t.direction === "CREDIT" ? "text-emerald-300" : "text-rose-300"}`}>
                            {t.direction}
                          </span>
                          <span className="text-slate-400">{fmtDate(t.createdAt)}</span>
                        </div>
                        <span className="text-slate-200 font-medium">{t.direction === "CREDIT" ? "+" : "-"}{inr(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-20">
          <div className="text-sm text-slate-400">Loading context…</div>
        </div>
      )}
    </div>
  )
}

