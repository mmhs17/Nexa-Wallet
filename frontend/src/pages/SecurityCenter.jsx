import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { apiError, unwrap } from "../api/client.js";
import { fmtDate } from "../utils/format.js";
import { PageHeader, Empty } from "../components/ui.jsx";
const EV = { LOGIN_SUCCESS: ["🟢", "Successful login", "text-emerald-300"], LOGIN_FAILED: ["🔴", "Failed login", "text-rose-300"], LOGOUT: ["⏻", "Logged out", "text-slate-300"], PASSWORD_CHANGED: ["🔑", "Password changed", "text-amber-300"], TWO_FA_ENABLED: ["✓", "2FA enabled", "text-emerald-300"], TWO_FA_DISABLED: ["✗", "2FA disabled", "text-rose-300"], TWO_FA_VERIFIED: ["✓", "2FA verified", "text-emerald-300"], NEW_DEVICE: ["🟡", "New device detected", "text-amber-300"], SUSPICIOUS_LOGIN: ["🟡", "Suspicious login", "text-amber-300"], WALLET_FROZEN: ["🚨", "Wallet frozen", "text-rose-300"], WALLET_UNFROZEN: ["🔓", "Wallet unlocked", "text-emerald-300"], PAYMENT_BLOCKED: ["🚫", "Payment blocked", "text-rose-300"], PAYMENT_VERIFIED: ["✅", "Payment verified", "text-emerald-300"], SESSION_REVOKED: ["⏹", "Session revoked", "text-slate-300"], ACCOUNT_LOCKED: ["🔒", "Account locked", "text-rose-300"], RECOVERY_CODE_USED: ["🔑", "Recovery code used", "text-amber-300"], TX_PIN_SET: ["🔐", "Security key set", "text-amber-300"], TX_PIN_REMOVED: ["🔓", "Security key removed", "text-rose-300"] };
export default function SecurityCenter() {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pinState, setPinState] = useState(null);
  const [newPin, setNewPin] = useState('');
  const [pinPw, setPinPw] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const [s, e] = await Promise.all([api.get("/security/overview"), api.get("/security/events?limit=50")]); setData(unwrap(s)); setEvents(unwrap(e)?.data || []); } catch (e) { setError(apiError(e)); } finally { setLoading(false); } }, []);useEffect(() => { load(); }, [load]);

  const loadPin = useCallback(async () => {
    try { setPinState(unwrap(await api.get('/security/tx-pin'))); }
    catch { setPinState({ enabled: false }); }
  }, []);
  useEffect(() => { loadPin(); }, [loadPin]);

  const savePin = async () => {
    setPinError('');
    if (!/^\d{4}$/.test(newPin)) { setPinError('Security key must be exactly 4 digits.'); return; }
    if (!pinPw) { setPinError('Enter your account password to confirm.'); return; }
    setPinSaving(true);
    try {
      await api.post('/security/tx-pin', { pin: newPin, password: pinPw });
      setNewPin(''); setPinPw('');
      await loadPin();
    } catch (e) { setPinError(apiError(e)); }
    finally { setPinSaving(false); }
  };

  const removePin = async () => {
    setPinError('');
    if (!pinPw) { setPinError('Enter your account password to confirm.'); return; }
    if (!confirm('Remove your NEXA Security Key? Outgoing payments will no longer require it.')) return;
    setPinSaving(true);
    try {
      await api.delete('/security/tx-pin', { data: { password: pinPw } });
      setPinPw('');
      await loadPin();
    } catch (e) { setPinError(apiError(e)); }
    finally { setPinSaving(false); }
  };

  const revokeSession = async (sid) => {
    try { await api.post('/security/sessions/revoke', { sessionId: sid }); load(); }
    catch (e) { setError(apiError(e)); }
  };
  const revokeAll = async () => {
    if (!confirm('Revoke all other sessions?')) return;
    try { await api.post('/security/sessions/revoke-all'); setEvents([]); load(); }
    catch (e) { setError(apiError(e)); }
  };

  if (loading) return <div className='flex items-center justify-center py-20 text-slate-400'><div className='text-sm'>Loading...</div></div>;
  if (error && !data) return <div className='flex flex-col items-center gap-3 py-20'><div className='alert-err max-w-md text-center'>{error}</div><button className='btn-ghost' onClick={load}>Retry</button></div>;

  const score = data?.posture?.score ?? 0;
  const sc = score >= 80 ? 'text-emerald-300' : score >= 60 ? 'text-amber-300' : 'text-rose-300';
  const sl = score >= 80 ? 'Strong security posture' : score >= 60 ? 'Needs improvement' : 'At risk - review recommended';
  const factorLabel = (f) => typeof f === "string" ? f.replace(/_/g, " ") : (f?.detail || String(f?.code || "").replace(/_/g, " "));

  return (
    <div className='space-y-6'>
      <PageHeader title='Security Center' subtitle='Your financial security dashboard.' />
      <div className='grid gap-4 md:grid-cols-3'>
        <div className='card !p-5'>
          <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>NEXA Security Score</div>
          <div className='mt-2 flex items-baseline gap-2'><span className={`font-display text-5xl font-bold ${sc}`}>{score}</span><span className='text-sm text-slate-400'>/100</span></div>
          <div className={`mt-1 text-sm ${sc}`}>{sl}</div>
        </div>
        <div className='card !p-5'>
          <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>Wallet Status</div>
          <div className='mt-2 flex items-center gap-2'><span className={`inline-flex h-3 w-3 rounded-full ${data?.walletLock?.status === "FROZEN" ? "bg-rose-400" : "bg-emerald-400"}`} /><span className='font-display text-xl font-bold'>{data?.walletLock?.locked ? "Locked" : "Active"}</span></div>
          <div className='mt-1 text-xs text-slate-400'>Status: {data?.walletLock?.status || "—"}</div>
          {data?.walletLock?.frozenReason && <div className='mt-1 text-xs text-slate-500'>{data.walletLock.frozenReason}</div>}
          <Link to='/privacy' className='mt-3 inline-block text-xs text-nexa-300 hover:text-nexa-200 underline underline-offset-2'>Manage Privacy Shield</Link>
          <div className='mt-1 text-sm text-slate-400'>{data?.walletLock?.locked ? 'Emergency lock active.' : 'Wallet active - all operations available.'}</div>
        </div>
        <div className='card !p-5'>
          <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>Two-Factor Auth</div>
          <div className='mt-2 flex items-center gap-2'><span className={`inline-flex h-3 w-3 rounded-full`} /><span className='font-display text-xl font-bold'>{data?.twoFactor?.enabled ? 'Enabled' : 'Not enabled'}</span></div>
          <div className='mt-1 text-sm text-slate-400'>{data?.twoFactor?.enabled ? (data?.twoFactor?.confirmedAt ? 'Active since ' + fmtDate(data.twoFactor.confirmedAt) : 'Active') : 'Enable 2FA for +30 posture points'}</div>
        </div>
      </div>
      <div className='grid gap-4 lg:grid-cols-2'>
        <div className='card !p-5'>
          <div className='flex items-center justify-between mb-4'><h3 className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>Active Sessions</h3>{data?.sessions?.others?.length > 0 && <button className='text-xs text-rose-300 hover:text-rose-200 underline underline-offset-2' onClick={revokeAll}>Revoke all others</button>}</div>
          {(!data?.sessions?.items || data.sessions.items.length === 0) ? <Empty message='No active sessions.' /> : (
            <div className='space-y-2'>
              {data?.sessions?.items?.map(session => (
                <div key={session.id} className={`flex items-center justify-between py-2 px-3 rounded-lg border ${session.isCurrent ? "bg-nexa-500/10 border-nexa-500/20" : "border-white/5"}`}>
                  <div className='flex items-center gap-3'>
                    <span className='text-sm'>{session.deviceLabel || session.deviceId || 'Unknown device'}{session.isCurrent ? ' (this device)' : ''}</span>
                    <span className='text-xs text-slate-400'>{session.ipAddress || 'Unknown IP'} - {fmtDate(session.lastActiveAt)}</span>
                  </div>
                  {!session.isCurrent && <button className='text-xs text-rose-300 hover:text-rose-200 underline underline-offset-2' onClick={() => revokeSession(session.id)}>Revoke</button>}
                </div>
              ))}
            </div>
          )}
          <div className='mt-1 text-xs text-slate-400'>{data?.sessions?.total || 0} active session(s){data?.sessions?.items?.some(s => s.isCurrent) ? ' · this device highlighted' : ''}</div>
        </div>
        <div className='card !p-5'>
          <div className='flex items-center justify-between mb-4'><h3 className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>Security Timeline</h3><button className='text-xs text-nexa-300 hover:text-nexa-200 underline underline-offset-2' onClick={load}>Refresh</button></div>
          {events.length === 0 ? <Empty message='No security events yet.' /> : <div className='space-y-1'>{events.map(ev => { const m = EV[ev.type] || ['•', ev.type, 'text-slate-300']; return <div key={ev.id} className='flex items-start gap-3 py-2 border-b border-white/5 last:border-0'><span className='text-base'>{m[0]}</span><div className='flex-1 min-w-0'><div className="text-sm font-medium">{m[1]}</div><div className='text-xs text-slate-400'>{fmtDate(ev.createdAt)} - {ev.message || ''}</div></div><span className='text-xs text-slate-500'>{ev.severity}</span></div>; })}</div>}
          {data?.posture?.factors?.length > 0 && (
            <div className='mt-4 border-t border-white/5 pt-3'>
              <div className='mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500'>What drives your score</div>
              <div className='space-y-1.5'>
                {data.posture.factors.map((f, i) => (
                  <div key={i} className='flex items-center justify-between gap-3 text-xs'>
                    <span className='text-slate-400'>{factorLabel(f)}</span>
                    <span className={`font-semibold ${f.points > 0 ? "text-emerald-300" : "text-slate-500"}`}>+{f.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className='card !p-5'>
        <div className='mb-1 flex items-center justify-between'>
          <h3 className='text-[11px] font-semibold uppercase tracking-wider text-slate-400'>NEXA Security Key</h3>
          <span className={`text-[11px] font-semibold ${pinState?.enabled ? 'text-emerald-300' : 'text-slate-500'}`}>
            {pinState?.enabled ? 'Enabled' : 'Not set'}
          </span>
        </div>
        <p className='mb-4 text-xs text-slate-400'>
          A 4-digit key required to authorize outgoing payments, separate from your login password.
        </p>

        {pinState?.locked && (
          <div className='mb-3 alert-err text-sm'>
            Locked after {pinState.maxAttempts} wrong attempts. Try again in {pinState.unlockInMinutes} minute(s).
          </div>
        )}

        <div className='grid gap-3 sm:grid-cols-2'>
          <div>
            <label className='label'>{pinState?.enabled ? 'New key' : 'Create key'}</label>
            <input
              className='input text-center font-mono text-lg tracking-[0.5em]'
              type='password' inputMode='numeric' autoComplete='off' maxLength={4}
              placeholder='••••'
              value={newPin}
              onChange={e => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
            />
          </div>
          <div>
            <label className='label'>Account password</label>
            <input
              className='input' type='password' autoComplete='current-password'
              placeholder='Confirm with password'
              value={pinPw}
              onChange={e => { setPinPw(e.target.value); setPinError(''); }}
            />
          </div>
        </div>

        {pinError && <p className='mt-2 text-xs text-rose-400'>{pinError}</p>}

        <div className='mt-4 flex flex-wrap gap-2'>
          <button className='btn-primary' onClick={savePin} disabled={pinSaving || pinState?.locked}>
            {pinSaving ? 'Saving…' : pinState?.enabled ? 'Update key' : 'Enable key'}
          </button>
          {pinState?.enabled && (
            <button className='btn-ghost text-rose-300' onClick={removePin} disabled={pinSaving}>
              Remove key
            </button>
          )}
        </div>
      </div>
      <div className='card !p-5'>
        <h3 className='mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400'>Quick Actions</h3>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {data?.twoFactor?.enabled === false && <Link to='/security' className='card !p-4 border border-dashed border-white/15 hover:bg-white/[0.04] transition text-center'><div className='text-2xl'>🔐</div><div className='mt-1 text-sm font-medium'>Enable 2FA</div><div className='text-xs text-slate-400'>Add extra security</div></Link>}
          <Link to='/security' className='card !p-4 border border-dashed border-white/15 hover:bg-white/[0.04] transition text-center'><div className='text-2xl'>🔑</div><div className='mt-1 text-sm font-medium'>Change Password</div><div className='text-xs text-slate-400'>Update password</div></Link>
          <Link to='/privacy' className='card !p-4 border border-dashed border-white/15 hover:bg-white/[0.04] transition text-center'><div className='text-2xl'>👁</div><div className='mt-1 text-sm font-medium'>Privacy Shield</div><div className='text-xs text-slate-400'>Hide financial data</div></Link>
          <Link to='/wallet' className='card !p-4 border border-dashed border-white/15 hover:bg-white/[0.04] transition text-center'><div className='text-2xl'>🚨</div><div className='mt-1 text-sm font-medium'>Emergency Lock</div><div className='text-xs text-slate-400'>Freeze wallet instantly</div></Link>
        </div>
      </div>
    </div>
  );
}
