'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';
import DocButton from './DocButton';

export default function TinForm({ types, price, slipPrice, certPrice }: { types: string[]; price: string; slipPrice: string; certPrice: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'nin' | 'rc'>('nin');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(''); setRes(null);
    const f = new FormData(e.currentTarget);
    const r = await call('/api/tin', { type: f.get('type'), [mode]: f.get('id') });
    setBusy(false); router.refresh();
    if (!r.ok) return setErr(r.data.error ?? 'Something went wrong');
    setRes(r.data);
  }
  const t = res?.tin;
  return (
    <>
      <form className="card" onSubmit={go}>
        <div className="tabs">
          <button type="button" className={mode === 'nin' ? 'on' : ''} onClick={() => setMode('nin')}>Find by NIN</button>
          <button type="button" className={mode === 'rc' ? 'on' : ''} onClick={() => setMode('rc')}>Find by RC number</button>
        </div>
        <label>Taxpayer type</label>
        <select name="type" required defaultValue="">
          <option value="" disabled>Choose one</option>
          {types.map((x) => <option key={x}>{x}</option>)}
        </select>
        <label>{mode === 'nin' ? 'NIN' : 'RC number'}</label>
        <input name="id" required placeholder={mode === 'nin' ? '11 digits' : 'RC123456'} key={mode} />
        <button className="btn" disabled={busy}>{busy ? 'Searching…' : `Find TIN · ${price}`}</button>
        {err && <div className="alert err">{err}</div>}
      </form>
      {res && !res.found && <div className="alert err">{res.message}</div>}
      {t && (
        <div className="card">
          <h2>Tax ID found <span className="pill">{res.reference}</span></h2>
          <dl className="kv">
            <dt>TIN</dt><dd>{t.tin}</dd><dt>Registered name</dt><dd>{t.registeredName}</dd><dt>Taxpayer type</dt><dd>{t.taxpayerType}</dd>
            <dt>Tax office</dt><dd>{t.taxOffice}</dd><dt>Status</dt><dd>{t.status}</dd>
          </dl>
          {res.via === 'nin'
            ? <DocButton checkId={res.checkId} doc="tin_slip" label="Print TIN slip" price={slipPrice} />
            : <DocButton checkId={res.checkId} doc="tin_certificate" label="Get TIN certificate" price={certPrice} />}
        </div>
      )}
    </>
  );
}
