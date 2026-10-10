import { RefundButton } from '@/components/AdminRowActions';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export default async function Page() {
  await requireAdmin();
  const { rows } = await query(`SELECT l.id, l.kind, l.amount_kobo, l.reference, l.created_at, u.email,
      EXISTS (SELECT 1 FROM ledger_entries r WHERE r.idempotency_key = 'refund:' || l.id::text) AS refunded
    FROM ledger_entries l JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 200`);
  return (
    <>
      <h1>Transactions</h1>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>User</th><th>Type</th><th>Reference</th><th>Amount</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td>{new Date(r.created_at).toLocaleString('en-NG')}</td><td>{r.email}</td><td><span className="pill">{r.kind}</span></td><td>{r.reference}</td>
              <td>{Number(r.amount_kobo) < 0 ? '−' : '+'}{naira(Math.abs(Number(r.amount_kobo)))}</td>
              <td>{r.kind === 'charge' && (r.refunded ? <span className="pill warn">refunded</span> : <RefundButton entryId={r.id} />)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
