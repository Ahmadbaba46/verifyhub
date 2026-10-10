import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';

export default async function Page() {
  const user = await requireUser();
  const { rows } = await query(
    `SELECT c.reference, c.service_key, c.channel, c.status, c.input_hint, c.created_at, s.label
     FROM checks c JOIN services s ON s.key = c.service_key WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 100`, [user.id]);
  return (
    <>
      <h1>History</h1>
      <p className="muted">Results are deleted automatically after a short time. Only a masked reference is kept here.</p>
      <div className="card">
        <table>
          <thead><tr><th>Date</th><th>Service</th><th>Input</th><th>Via</th><th>Status</th><th>Ref</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.reference}><td>{new Date(r.created_at).toLocaleString('en-NG')}</td><td>{r.label}</td><td>{r.input_hint}</td><td>{r.channel}</td>
              <td><span className={'pill ' + (r.status === 'completed' ? '' : 'warn')}>{r.status === 'refunded' ? 'refunded' : r.status}</span></td><td>{r.reference}</td></tr>
          ))}</tbody>
        </table>
        {!rows.length && <p className="muted">You have not run any checks yet.</p>}
      </div>
    </>
  );
}
