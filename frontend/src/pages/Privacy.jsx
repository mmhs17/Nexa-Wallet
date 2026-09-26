import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { PageHeader, Badge } from "../components/ui.jsx"
import api, { apiError, unwrap } from "../api/client.js"

export default function Privacy() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get("/privacy")
      .then(unwrap)
      .then(setSettings)
      .catch(e => setError(apiError(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><div className="text-sm">Loading privacy overview…</div></div>
  if (error) return <div className="flex flex-col items-center gap-3 py-20"><div className="alert-err max-w-md text-center">{error}</div></div>

  const shield = settings?.shieldActive
  const hideBal = settings?.hideBalance
  const hideAmt = settings?.hideTransactionAmounts
  const hideNames = settings?.hideRecipientNames
  const hideAnalytics = settings?.hideAnalytics
  const lockMin = settings?.autoLockMinutes

  const cards = [
    { title: "Privacy Shield", desc: "Remove your profile from recipient discovery. Only past payees can find you.", active: shield },
    { title: "Hide Balance", desc: "Blur your wallet balance on the dashboard and transaction pages.", active: hideBal },
    { title: "Hide Amounts", desc: "Mask transaction amounts in your history with a masked value.", active: hideAmt },
    { title: "Hide Names", desc: "Show only usernames instead of full names in your transaction list.", active: hideNames },
    { title: "Hide Analytics", desc: "Exclude your spending from aggregated, anonymized platform insights.", active: hideAnalytics },
  ]

  const cls = a => a ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : "text-slate-400 bg-white/5 border-white/10"

  return (
    <div className="space-y-6">
      <PageHeader title="Privacy" subtitle="Control what you share and how your data is used." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <div key={i} className="card !p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{c.title}</span>
              <Badge className={cls(c.active)}>{c.active ? "On" : "Off"}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-400">{c.desc}</p>
          </div>
        ))}
      </div>
      <div className="card !p-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Auto-Lock</div>
          <div className="mt-1 text-sm text-slate-300">{lockMin ? `Locks after ${lockMin} min of inactivity.` : "Auto-lock duration not set."}</div>
        </div>
        <Link to="/privacy/settings" className="text-xs text-nexa-400 hover:text-nexa-300 whitespace-nowrap">Change settings →</Link>
      </div>
      <div className="card !p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">How Your Data Is Protected</h3>
        <div className="space-y-3 text-sm text-slate-400">
          <div className="flex items-start gap-3">
            <span className="text-nexa-400 mt-0.5">🔒</span>
            <div><div className="text-slate-200 font-medium">End-to-end encryption</div><div>Sensitive fields are encrypted before storage. Only you hold the keys.</div></div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-nexa-400 mt-0.5">⏱️</span>
            <div><div className="text-slate-200 font-medium">Session-based access</div><div>Every request is authenticated and scoped to your user ID.</div></div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-nexa-400 mt-0.5">📋</span>
            <div><div className="text-slate-200 font-medium">Full audit trail</div><div>Every action is logged. Nothing happens without a record.</div></div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-nexa-400 mt-0.5">🛡️</span>
            <div><div className="text-slate-200 font-medium">Local fraud scanning</div><div>NEXA scans payments using only your data — no third-party sharing.</div></div>
          </div>
        </div>
      </div>
      <div className="card !p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Privacy Policy</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          NEXA Wallet collects only the data necessary to operate your wallet: identity information for KYC compliance, transaction records for accounting and fraud prevention, and optional preferences to personalize your experience. We do not sell your data, share it with advertisers, or use it beyond what you've explicitly consented to. You may request a copy of your data or its deletion at any time through the Security Center.
        </p>
      </div>
    </div>
  )
}
