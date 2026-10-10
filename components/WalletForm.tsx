'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

export default function WalletForm({ mock, presets }: { mock: boolean; presets: number[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setOk('');
    const r = await call('/api/wallet/fund', { amount });
    if (!r.ok) { setBusy(false); return setErr(r.data.error ?? 'Could not start payment'); }
    if (r.data.mock) {
      const p = await call('/api/wallet/mock-pay', { reference: r.data.reference });
      setBusy(false);
      if (!p.ok) return setErr(p.data.error ?? 'Payment failed');
      setOk('Test payment received. Your wallet has been credited.'); setAmount(''); router.refresh();
    } else {
      setBusy(false); setErr('Payment gateway is not configured yet.');
    }
  }
  return (
    <form className="card" onSubmit={go}>
      <h2>Fund your wallet</h2>
      <div className="row">{presets.map((n) => <button type="button" key={n} className="btn ghost" style={{ marginTop: 0 }} onClick={() => setAmount(String(n))}>₦{n.toLocaleString()}</button>)}</div>
      <label>Amount (₦)</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
      <button className="btn" disabled={busy}>{busy ? 'Processing…' : mock ? 'Add funds (test mode)' : 'Pay now'}</button>
      {mock && <p className="muted">Test mode: no real money moves. A payment gateway will replace this button.</p>}
      {err && <div className="alert err">{err}</div>}{ok && <div className="alert ok">{ok}</div>}
    </form>
  );
}
