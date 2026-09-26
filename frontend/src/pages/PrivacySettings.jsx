import { useEffect, useState, useCallback } from 'react';
import api, { apiError, unwrap } from '../api/client.js';
import { PageHeader } from '../components/ui.jsx';

/**
 * NEXA Wallet — Privacy Shield settings (editable toggles).
 * Reads and writes GET/PUT /privacy.
 */

const VISIBILITY_FIELDS = [
  { key: 'hideBalance', title: 'Hide Balance', desc: 'Mask wallet balance on dashboard and transactions' },
  { key: 'hideTransactionAmounts', title: 'Hide Transaction Amounts', desc: 'Mask amounts in transaction history and receipts' },
  { key: 'hideRecipientNames', title: 'Hide Recipient Names', desc: 'Mask recipient names in transaction history' },
  { key: 'hideAnalytics', title: 'Hide Analytics', desc: 'Mask spending analytics and insights' },
];

const AUTO_LOCK_OPTIONS = [1, 5, 15, 30];

const SHIELD_FIELDS = ['shieldActive', 'hideBalance', 'hideTransactionAmounts', 'hideRecipientNames', 'hideAnalytics'];

const TRACK_OFF = 'relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer bg-white/15';
const TRACK_ON = 'relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer bg-nexa-500';
const KNOB_OFF = 'inline-block h-4 w-4 rounded-full bg-white shadow transition translate-x-1';
const KNOB_ON = 'inline-block h-4 w-4 rounded-full bg-white shadow transition translate-x-6';

function Toggle({ on, onToggle, disabled }) {
  return (
    <button
      type='button'
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={on ? TRACK_ON : TRACK_OFF}
    >
      <span className={on ? KNOB_ON : KNOB_OFF} />
    </button>
  );
}

export default function PrivacySettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/privacy');
      setSettings(unwrap(res));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (key, value) => {
    setSaving(true);
    setError(null);
    try {
      await api.put('/privacy', { [key]: value });
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSuccess('Setting updated');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key) => {
    if (!settings) return;
    update(key, !settings[key]);
  };

  const shieldOn = !!settings?.shieldActive
    && SHIELD_FIELDS.slice(1).some((k) => !!settings[k]);

  const setAll = (value) => {
    SHIELD_FIELDS.forEach((k) => update(k, value));
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center py-20 text-slate-400'>
        <div className='text-sm'>Loading privacy settings…</div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className='flex flex-col items-center gap-3 py-20'>
        <div className='alert-err max-w-md text-center'>{error}</div>
        <button className='btn-ghost' onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <PageHeader title='Privacy Shield' subtitle='Control who sees your financial information.' />

      <div className='grid gap-4 lg:grid-cols-2'>
        {/* Visibility Controls */}
        <div className='card !p-5'>
          <h3 className='text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-4'>Visibility Controls</h3>
          <div className='space-y-3'>
            {VISIBILITY_FIELDS.map((f) => (
              f.key in (settings || {}) ? (
                <div key={f.key} className='flex items-center justify-between py-2 border-b border-white/5 last:border-b-0'>
                  <div className='pr-4'>
                    <div className='text-sm font-medium'>{f.title}</div>
                    <div className='text-xs text-slate-400'>{f.desc}</div>
                  </div>
                  <Toggle on={!!settings[f.key]} disabled={saving} onToggle={() => toggle(f.key)} />
                </div>
              ) : null
            ))}
          </div>
        </div>

        {/* Privacy Overview */}
        <div className='card !p-5'>
          <h3 className='text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-4'>Privacy Overview</h3>
          <div className='space-y-4'>
            {settings?.shieldActive !== undefined && (
              <div
                className={shieldOn ? 'rounded-xl border border-sky-500/40 bg-sky-500/[0.08] p-4' : 'rounded-xl border border-white/10 bg-white/[0.02] p-4'}
              >
                <div className='flex items-center gap-3'>
                  <div className='text-3xl'>👁</div>
                  <div>
                    <div className='text-sm font-semibold'>Privacy Shield</div>
                    <div className='text-xs text-slate-400 mt-0.5'>
                      {shieldOn ? 'Active — sensitive data is masked' : 'Inactive — all data visible'}
                    </div>
                  </div>
                </div>
                <div className='mt-3 flex gap-2'>
                  {!shieldOn && (
                    <button
                      className='btn-primary text-xs'
                      onClick={() => setAll(true)}
                      disabled={saving}
                    >
                      {saving ? 'Enabling…' : 'Activate All'}
                    </button>
                  )}
                  {shieldOn && (
                    <button
                      className='btn-ghost text-xs'
                      onClick={() => setAll(false)}
                      disabled={saving}
                    >
                      {saving ? 'Disabling…' : 'Deactivate All'}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className='rounded-xl border border-white/10 bg-white/[0.02] p-4'>
              <div className='text-sm font-semibold mb-2'>What gets hidden?</div>
              <ul className='text-xs text-slate-400 space-y-1'>
                <li>• Wallet balance on dashboard</li>
                <li>• Transaction amounts in history</li>
                <li>• Recipient names in transactions</li>
                <li>• Spending analytics and trends</li>
                <li>• Financial insights summaries</li>
              </ul>
            </div>

            <div className='rounded-xl border border-white/10 bg-white/[0.02] p-4'>
              <div className='text-sm font-semibold mb-2'>Auto-Lock Settings</div>
              <div className='mt-2 space-y-2'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='text-slate-300'>Auto-lock after inactivity</span>
                  <select
                    className='input w-auto text-xs'
                    value={settings?.autoLockMinutes || 5}
                    onChange={(e) => update('autoLockMinutes', Number(e.target.value))}
                    disabled={saving}
                  >
                    {AUTO_LOCK_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m === 1 ? '1 minute' : `${m} minutes`}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className='alert-err'>{error}</div>}
      {success && <div className='alert-ok'>{success}</div>}
      <div className='text-xs text-slate-500 text-center pb-4'>
        Your privacy settings are stored securely and only visible to you.
      </div>
    </div>
  );
}

