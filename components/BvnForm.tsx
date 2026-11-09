'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

export default function BvnForm({ price }: { price: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(''); setRes(null);
    const bvn = String(new FormData(e.currentTarget).get('bvn'));
    const r = await call('/api/bvn', { bvn });
    setBusy(false); router.refresh();
    if (!r.ok) return setErr(r.data.error ?? 'Something went wrong');
    setRes(r.data);
  }
  const d = res?.bvn;
  return (
    <>
      <form className="card" onSubmit={go}>
        <label>Bank Verification Number</label>
        <input name="bvn" inputMode="numeric" placeholder="11 digits" required />
        <button className="btn" disabled={busy}>{busy ? 'Checking…' : `Validate · ${price}`}</button>
        {err && <div className="alert err">{err}</div>}
      </form>
      {res && !res.found && <div className="alert err">{res.message}</div>}
      {d && (
        <div className="card">
          <h2>BVN found <span className="pill">{res.reference}</span></h2>
          <dl className="kv">
            <dt>First name</dt><dd>{d.firstName}</dd>
            <dt>Middle name</dt><dd>{d.middleName || '—'}</dd>
            <dt>Last name</dt><dd>{d.lastName}</dd>
            <dt>Date of birth</dt><dd>{d.dateOfBirth}</dd>
            <dt>Gender</dt><dd>{d.gender}</dd>
            <dt>Phone</dt><dd>{d.phoneNumber || '—'}</dd>
            <dt>Address</dt><dd>{d.address || '—'}</dd>
          </dl>
        </div>
      )}
    </>
  );
}
