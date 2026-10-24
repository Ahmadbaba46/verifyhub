import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export const dynamic = 'force-dynamic';

const SVC_LABEL: Record<string, string> = { nin: 'NIN lookup', match: 'Passport match', tin: 'TIN lookup' };
const OUTCOME_LABEL: Record<string, string> = {
  not_found: 'Not found (404)', invalid: 'Invalid input (422)', provider_error: 'Provider error (502)',
  insufficient: 'Wallet too low (402)', rate_limited: 'Rate limited (429)', ip_blocked: 'IP blocked (403)', forbidden: 'Forbidden (403)', unavailable: 'Service paused (503)',
};
const speed = (ms: number | null) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

export default async function Page() {
  await requireAdmin();
  const [{ rows: t }, { rows: daily }, { rows: byClient }, { rows: errs }, { rows: upstream }, { rows: attention }] = await Promise.all([
    query(
      `SELECT count(*)::int AS requests, count(*) FILTER (WHERE outcome='ok')::int AS billed,
              COALESCE(sum(charged_kobo),0)::bigint AS revenue,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE outcome='ok') AS p95
       FROM api_requests WHERE created_at > now() - interval '30 days'`),
    query(
      `SELECT to_char(d::date,'DD Mon') AS label,
              COALESCE(count(*) FILTER (WHERE r.outcome='ok'),0)::int AS billed,
              COALESCE(count(*) FILTER (WHERE r.outcome<>'ok'),0)::int AS other
       FROM generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') d
       LEFT JOIN api_requests r ON r.created_at::date = d::date
       GROUP BY d ORDER BY d`),
    query(
      `SELECT u.name, COALESCE(sum(r.charged_kobo),0)::bigint AS revenue
       FROM api_requests r JOIN users u ON u.id = r.user_id
       WHERE r.created_at > now() - interval '30 days' GROUP BY u.name ORDER BY revenue DESC LIMIT 6`),
    query(
      `SELECT outcome, count(*)::int AS n FROM api_requests
       WHERE created_at > now() - interval '30 days' AND outcome <> 'ok' GROUP BY outcome ORDER BY n DESC`),
    query(
      `SELECT service_key, count(*) FILTER (WHERE outcome='ok')::int AS billed,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE outcome='ok') AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE outcome='ok') AS p95,
              round(100.0 * count(*) FILTER (WHERE outcome='provider_error') / NULLIF(count(*),0), 1) AS err
       FROM api_requests WHERE service_key IS NOT NULL AND created_at > now() - interval '30 days' GROUP BY service_key`),
    query(
      `SELECT u.id, u.name, w.balance_kobo FROM api_clients c JOIN users u ON u.id = c.user_id JOIN wallets w ON w.user_id = c.user_id
       WHERE c.status='approved' AND w.balance_kobo < 500000 ORDER BY w.balance_kobo LIMIT 6`),
  ]);

  const totals = t[0];
  const success = totals.requests ? Math.round((totals.billed / totals.requests) * 100) : 0;
  const maxDay = Math.max(1, ...daily.map((d) => d.billed + d.other));
  const topRev = Math.max(1, ...byClient.map((c) => Number(c.revenue)));
  const errTotal = errs.reduce((a, e) => a + e.n, 0);

  return (
    <>
      <h1>API metrics</h1>
      <p className="muted">How the API is used across all clients, what it earns, and where it fails. Last 30 days.</p>

      <div className="statrow">
        <div className="statcard"><div className="l">Requests</div><div className="n">{totals.requests.toLocaleString()}</div></div>
        <div className="statcard"><div className="l">Success rate</div><div className="n">{success}%</div><div className="s">{totals.billed.toLocaleString()} billed</div></div>
        <div className="statcard"><div className="l">Revenue</div><div className="n">{naira(totals.revenue)}</div><div className="s">after agreed discounts</div></div>
        <div className="statcard"><div className="l">Slowest 5%</div><div className="n">{speed(totals.p95 ? Math.round(totals.p95) : null)}</div></div>
      </div>

      <div className="card">
        <h2>Requests per day</h2>
        <div className="bars" aria-hidden="true">
          {daily.map((d, i) => (
            <div className="col" key={i} title={`${d.label}: ${d.billed} billed, ${d.other} other`}>
              <div className="u" style={{ height: `${Math.round((d.other / maxDay) * 150)}px` }} />
              <div className="b" style={{ height: `${Math.max(Math.round((d.billed / maxDay) * 150), d.billed ? 2 : 0)}px` }} />
            </div>
          ))}
        </div>
        <div className="scroll" style={{ marginTop: 6 }}><div style={{ display: 'flex', gap: 6, minWidth: 560 }}>{daily.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{d.label.split(' ')[0]}</div>)}</div></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div className="card" style={{ flex: '1 1 340px', margin: 0 }}>
          <h2>Revenue by client</h2>
          {byClient.map((c, i) => (
            <div key={i} style={{ margin: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><strong>{c.name}</strong><span>{naira(c.revenue)}</span></div>
              <div style={{ height: 12, background: '#EEF1EC', borderRadius: 4 }}><div style={{ height: 12, width: `${Math.round((Number(c.revenue) / topRev) * 100)}%`, background: 'var(--accent)', borderRadius: 4 }} /></div>
            </div>
          ))}
          {byClient.length === 0 && <p className="muted">No billed requests yet.</p>}
        </div>

        <div className="card" style={{ flex: '1 1 300px', margin: 0 }}>
          <h2>Why requests were not billed</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Reason</th><th>Count</th><th>Share</th></tr></thead>
              <tbody>
                {errs.map((e) => (<tr key={e.outcome}><td>{OUTCOME_LABEL[e.outcome] ?? e.outcome}</td><td>{e.n}</td><td className="muted">{errTotal ? Math.round((e.n / errTotal) * 100) : 0}%</td></tr>))}
                {errs.length === 0 && <tr><td colSpan={3} className="muted">No failures in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {attention.length > 0 && (
        <div className="card">
          <h2>Needs attention</h2>
          {attention.map((a) => (
            <div key={a.id} className="promo" style={{ marginBottom: 10 }}>
              <strong>Low balance</strong> — <Link href={`/admin/api-clients/${a.id}`} style={{ fontWeight: 700 }}>{a.name}</Link> has {naira(a.balance_kobo)} left. Requests will start failing with a payment error.
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Upstream services</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Service</th><th>Billed</th><th>Median</th><th>Slowest 5%</th><th>Provider errors</th><th>Cost per call</th></tr></thead>
            <tbody>
              {upstream.map((u) => (
                <tr key={u.service_key}>
                  <td><strong>{SVC_LABEL[u.service_key] ?? u.service_key}</strong></td>
                  <td>{u.billed.toLocaleString()}</td>
                  <td>{speed(u.p50 ? Math.round(u.p50) : null)}</td>
                  <td>{speed(u.p95 ? Math.round(u.p95) : null)}</td>
                  <td>{u.err ?? 0}%</td>
                  <td className="muted">[set in settings]</td>
                </tr>
              ))}
              {upstream.length === 0 && <tr><td colSpan={6} className="muted">No requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="hint">Gross margin needs the upstream cost per call, which is configured once providers are connected.</p>
      </div>
    </>
  );
}
