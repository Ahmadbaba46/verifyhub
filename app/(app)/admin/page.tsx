import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export default async function Page() {
  await requireAdmin();
  const [{ rows: [u] }, { rows: [f] }, { rows: [c] }, { rows: byService }] = await Promise.all([
    query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week FROM users`),
    query(`SELECT COALESCE(sum(amount_kobo) FILTER (WHERE kind = 'topup'),0) AS funded, COALESCE(-sum(amount_kobo) FILTER (WHERE kind = 'charge'),0) AS spent, COALESCE(sum(amount_kobo) FILTER (WHERE kind = 'refund'),0) AS refunded FROM ledger_entries WHERE created_at > now() - interval '30 days'`),
    query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='refunded')::int AS refunded FROM checks WHERE created_at > now() - interval '30 days'`),
    query(`SELECT service_key, count(*)::int AS n FROM checks WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  return (
    <>
      <h1>Overview</h1><p className="muted">Last 30 days</p>
      <div className="grid">
        <div className="card"><span className="muted">Users</span><h2>{u.total}</h2><small>{u.week} new this week</small></div>
        <div className="card"><span className="muted">Funded</span><h2>{naira(f.funded)}</h2></div>
        <div className="card"><span className="muted">Spent on checks</span><h2>{naira(f.spent)}</h2></div>
        <div className="card"><span className="muted">Refunded</span><h2>{naira(f.refunded)}</h2></div>
        <div className="card"><span className="muted">Checks</span><h2>{c.total}</h2><small>{c.refunded} refunded</small></div>
      </div>
      <div className="card"><h2>Checks by service</h2>
        <table><tbody>{byService.map((r) => <tr key={r.service_key}><td>{r.service_key}</td><td>{r.n}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
