'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from './client';

export function UserActions({ id, status, self }: { id: string; status: string; self: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  async function act(body: Record<string, unknown>) {
    const r = await call(`/api/admin/users/${id}`, body);
    if (!r.ok) return setErr(r.data.error ?? 'Failed');
    setErr(''); router.refresh();
  }
  async function credit() {
    const amount = prompt('Amount in ₦ to credit');
    if (!amount) return;
    const reason = prompt('Reason (recorded in the audit log)');
    if (!reason) return;
    await act({ action: 'credit', amount, reason });
  }
  return (
    <span>
      <button className="btn ghost" style={{ margin: '0 6px 0 0', padding: '4px 10px' }} onClick={credit}>Credit</button>
      {!self && <button className={'btn ' + (status === 'active' ? 'danger' : 'ghost')} style={{ margin: 0, padding: '4px 10px' }} onClick={() => act({ action: status === 'active' ? 'suspend' : 'reactivate' })}>{status === 'active' ? 'Suspend' : 'Reactivate'}</button>}
      {err && <div className="alert err">{err}</div>}
    </span>
  );
}

export function RefundButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  async function go() {
    const reason = prompt('Reason for refund');
    if (!reason) return;
    const r = await call('/api/admin/refund', { entryId, reason });
    if (!r.ok) return setErr(r.data.error ?? 'Failed');
    router.refresh();
  }
  return <span><button className="btn ghost" style={{ margin: 0, padding: '4px 10px' }} onClick={go}>Refund</button>{err && <span className="pill bad">{err}</span>}</span>;
}
