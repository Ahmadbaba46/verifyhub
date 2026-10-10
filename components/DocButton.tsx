'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

export default function DocButton({ checkId, doc, label, price }: { checkId: string; doc: string; label: string; price: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function buy() {
    setBusy(true); setErr('');
    const r = await call(`/api/checks/${checkId}/document`, { doc });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error ?? 'Could not buy this document');
    router.refresh();
    window.location.href = r.data.url; // PDF download
  }
  return (
    <div>
      <button className="btn ghost" onClick={buy} disabled={busy}>{busy ? 'Preparing…' : `${label} · ${price}`}</button>
      {err && <div className="alert err">{err} {/Not enough|fund/i.test(err) && <a href="/wallet">Fund wallet</a>}</div>}
    </div>
  );
}
