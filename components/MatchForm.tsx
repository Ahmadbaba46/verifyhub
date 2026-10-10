'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

export default function MatchForm({ price }: { price: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(''); setRes(null);
    const r = await call('/api/match', Object.fromEntries(new FormData(e.currentTarget)));
    setBusy(false); router.refresh();
    if (!r.ok) return setErr(r.data.error ?? 'Something went wrong');
    setRes(r.data);
  }
  const c = res?.comparison;
  return (
    <>
      <form className="card" onSubmit={go}>
        <div className="row">
          <div><label>NIN</label><input name="nin" inputMode="numeric" required /></div>
          <div><label>Date of birth on NIN</label><input name="ninDob" type="date" required /></div>
        </div>
        <div className="row">
          <div><label>Passport number</label><input name="passportNumber" placeholder="A12345678" required /></div>
          <div><label>Date of birth on passport</label><input name="passportDob" type="date" required /></div>
        </div>
        <p className="muted">Image upload with automatic extraction is coming soon. For now, type the four details.</p>
        <button className="btn" disabled={busy}>{busy ? 'Comparing…' : `Compare · ${price}`}</button>
        {err && <div className="alert err">{err}</div>}
      </form>
      {res && !res.found && <div className="alert err">{res.message}</div>}
      {c && (
        <div className="card">
          <h2>{c.verdict === 'match' ? 'Everything matches' : c.verdict === 'partial' ? 'Mostly matching' : 'Details do not match'} <span className="pill">{res.reference}</span></h2>
          <table>
            <thead><tr><th>Field</th><th>NIN</th><th>Passport</th><th></th></tr></thead>
            <tbody>{c.fields.map((f: any) => (
              <tr key={f.field}><td>{f.field}</td><td>{f.nin}</td><td>{f.passport}</td><td><span className={'pill ' + (f.match ? '' : 'bad')}>{f.match ? 'Match' : 'Differs'}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
