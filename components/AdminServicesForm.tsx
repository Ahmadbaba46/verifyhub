'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

type Svc = { key: string; label: string; enabled: boolean; web_enabled: boolean; telegram_enabled: boolean; paused_message: string };
type Price = { key: string; label: string; amount: string };

export default function AdminServicesForm(props: { services: Svc[]; prices: Price[]; minTopup: string; retention: number; autoRefund: boolean }) {
  const router = useRouter();
  const [services, setServices] = useState(props.services);
  const [prices, setPrices] = useState(props.prices);
  const [minTopup, setMinTopup] = useState(props.minTopup);
  const [retention, setRetention] = useState(props.retention);
  const [autoRefund, setAutoRefund] = useState(props.autoRefund);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const upd = (i: number, patch: Partial<Svc>) => setServices(services.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    setBusy(true); setMsg(null);
    const r = await call('/api/admin/services', { services, prices: prices.map((p) => ({ key: p.key, amount: p.amount })), settings: { min_topup: minTopup, retention_hours: Number(retention), auto_refund: autoRefund } }, 'PUT');
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'Saved. Changes apply immediately.' } : { ok: false, text: r.data.error ?? 'Could not save' });
    if (r.ok) router.refresh();
  }
  return (
    <>
      {services.map((s, i) => (
        <div className="card" key={s.key}>
          <h2>{s.label}</h2>
          <div className="row">
            <label><input type="checkbox" checked={s.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} style={{ width: 'auto' }} /> Enabled</label>
            <label><input type="checkbox" checked={s.web_enabled} onChange={(e) => upd(i, { web_enabled: e.target.checked })} style={{ width: 'auto' }} /> Website</label>
            <label><input type="checkbox" checked={s.telegram_enabled} onChange={(e) => upd(i, { telegram_enabled: e.target.checked })} style={{ width: 'auto' }} /> Telegram</label>
          </div>
          <label>Message shown when paused</label>
          <input value={s.paused_message} onChange={(e) => upd(i, { paused_message: e.target.value })} />
          <div className="row">
            {prices.filter((p) => p.key.startsWith(s.key === 'match' ? 'match' : s.key === 'nin' ? 'nin' : 'tin')).map((p) => (
              <div key={p.key}><label>{p.label} (₦)</label>
                <input value={p.amount} inputMode="decimal" onChange={(e) => setPrices(prices.map((x) => (x.key === p.key ? { ...x, amount: e.target.value } : x)))} /></div>
            ))}
          </div>
        </div>
      ))}
      <div className="card">
        <h2>Wallet & privacy</h2>
        <div className="row">
          <div><label>Minimum top-up (₦)</label><input value={minTopup} onChange={(e) => setMinTopup(e.target.value)} /></div>
          <div><label>Keep results for (hours)</label><input type="number" min={1} max={720} value={retention} onChange={(e) => setRetention(Number(e.target.value))} /></div>
        </div>
        <label><input type="checkbox" checked={autoRefund} onChange={(e) => setAutoRefund(e.target.checked)} style={{ width: 'auto' }} /> Automatically refund when nothing is found or the provider fails</label>
      </div>
      <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      {msg && <div className={'alert ' + (msg.ok ? 'ok' : 'err')}>{msg.text}</div>}
    </>
  );
}
