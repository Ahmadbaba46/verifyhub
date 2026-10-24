import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export const dynamic = 'force-dynamic';

const LIST_KEY: Record<string, string> = { nin: 'nin_validate', match: 'match_check', tin: 'tin_lookup' };
const statusPill = (s: string) => (s === 'approved' ? 'pill' : s === 'pending' ? 'pill warn' : 'pill bad');

function bonusLabel(b: any): string {
  if (!b || b.type === 'none') return 'None';
  if (b.type === 'topup_percent') return `${b.percent ?? 0}% top-up bonus`;
  if (b.type === 'free_monthly') return `${b.count ?? 0} free/month`;
  return 'None';
}

export default async function Page() {
  await requireAdmin();
  const [{ rows: clients }, { rows: prices }, { rows: apiPrices }, { rows: totals }] = await Promise.all([
    query(
      `SELECT c.user_id, c.status, c.bonus, u.name, u.email,
              COALESCE(r.requests,0)::int AS requests, COALESCE(r.revenue,0)::bigint AS revenue
       FROM api_clients c JOIN users u ON u.id = c.user_id
       LEFT JOIN (SELECT user_id, count(*) AS requests, sum(charged_kobo) AS revenue FROM api_requests WHERE created_at > now() - interval '30 days' GROUP BY user_id) r ON r.user_id = c.user_id
       ORDER BY (c.status='pending') DESC, r.revenue DESC NULLS LAST, u.name`,
    ),
    query(`SELECT key, amount_kobo FROM prices WHERE key = ANY($1)`, [Object.values(LIST_KEY)]),
    query(`SELECT user_id, service_key, amount_kobo FROM api_prices`),
    query(
      `SELECT count(*) FILTER (WHERE status='approved')::int AS approved,
              count(*) FILTER (WHERE status='pending')::int AS pending,
              count(*) FILTER (WHERE status='suspended')::int AS suspended FROM api_clients`,
    ),
  ]);

  const listKobo: Record<string, number> = {};
  for (const p of prices) listKobo[p.key] = Number(p.amount_kobo);
  const agreed: Record<string, Record<string, number>> = {};
  for (const r of apiPrices) (agreed[r.user_id] ??= {})[r.service_key] = Number(r.amount_kobo);
  const rate = (uid: string, s: string) => agreed[uid]?.[s] ?? listKobo[LIST_KEY[s]] ?? 0;

  const revenue30 = clients.reduce((a, c) => a + Number(c.revenue), 0);
  const pending = clients.filter((c) => c.status === 'pending');
  const t = totals[0];

  return (
    <>
      <h1>API clients</h1>
      <p className="muted">Approve who can use the API, set each client&rsquo;s price, and give bonuses.</p>

      <div className="statrow">
        <div className="statcard"><div className="l">Approved</div><div className="n">{t.approved}</div><div className="s">{t.pending} pending · {t.suspended} suspended</div></div>
        <div className="statcard"><div className="l">API revenue (30d)</div><div className="n">{naira(revenue30)}</div></div>
        <div className="statcard"><div className="l">Clients</div><div className="n">{clients.length}</div></div>
      </div>

      {pending.length > 0 && (
        <div className="promo" style={{ margin: '16px 0' }}>
          <strong>{pending.length} request{pending.length > 1 ? 's' : ''} for API access.</strong> Review the account before you set a price.{' '}
          {pending.map((p) => (<Link key={p.user_id} href={`/admin/api-clients/${p.user_id}`} style={{ fontWeight: 700, marginLeft: 8 }}>{p.name} →</Link>))}
        </div>
      )}

      <div className="card">
        <div className="scroll">
          <table>
            <thead><tr><th>Client</th><th>Access</th><th>Rates (NIN / Match / TIN)</th><th>Bonus</th><th>Requests 30d</th><th>Revenue 30d</th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.user_id}>
                  <td><Link href={`/admin/api-clients/${c.user_id}`} style={{ fontWeight: 700 }}>{c.name}</Link><div className="hint">{c.email}</div></td>
                  <td><span className={statusPill(c.status)}>{c.status}</span></td>
                  <td style={{ fontSize: 13 }}>{c.status === 'pending' ? <span className="muted">Not set</span> : `${naira(rate(c.user_id, 'nin'))} / ${naira(rate(c.user_id, 'match'))} / ${naira(rate(c.user_id, 'tin'))}`}</td>
                  <td style={{ fontSize: 13 }}>{bonusLabel(c.bonus)}</td>
                  <td>{c.requests.toLocaleString()}</td>
                  <td><strong>{naira(c.revenue)}</strong></td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan={6} className="muted">No API clients yet. Users request access from their API keys page.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
