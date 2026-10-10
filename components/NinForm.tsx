'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';
import DocButton from './DocButton';

export default function NinForm({ price, slipPrice }: { price: string; slipPrice: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(''); setRes(null);
    const nin = String(new FormData(e.currentTarget).get('nin'));
    const r = await call('/api/nin', { nin });
    setBusy(false); router.refresh();
    if (!r.ok) return setErr(r.data.error ?? 'Something went wrong');
    setRes(r.data);
  }
  const d = res?.identity;
  return (
    <>
      <form className="card" onSubmit={go}>
        <label>National Identification Number</label>
        <input name="nin" inputMode="numeric" placeholder="11 digits" required />
        <button className="btn" disabled={busy}>{busy ? 'Checking…' : `Validate · ${price}`}</button>
        {err && <div className="alert err">{err}</div>}
      </form>
      {res && !res.found && <div className="alert err">{res.message}</div>}
      {d && (
        <div className="card">
          <h2>NIN found <span className="pill">{res.reference}</span></h2>
          <dl className="kv">
            <dt>Surname</dt><dd>{d.surname}</dd><dt>First name</dt><dd>{d.firstName}</dd><dt>Middle name</dt><dd>{d.middleName || '—'}</dd>
            <dt>Date of birth</dt><dd>{d.dob}</dd><dt>Gender</dt><dd>{d.gender}</dd><dt>State of origin</dt><dd>{d.stateOfOrigin ?? '—'}</dd>
          </dl>
          <DocButton checkId={res.checkId} doc="nin_slip" label="Print NIN slip" price={slipPrice} />
        </div>
      )}
    </>
  );
}
