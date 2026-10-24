import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/apiclient';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export const dynamic = 'force-dynamic';

const LIST_KEY: Record<string, string> = { nin: 'nin_validate', match: 'match_check', tin: 'tin_lookup' };
const SVC_LABEL: Record<string, string> = { nin: 'NIN validation', match: 'NIN & Passport match', tin: 'TIN finder' };

const OUTCOME: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Charged', cls: '' },
  not_found: { label: 'Not found', cls: 'warn' },
  invalid: { label: 'Invalid', cls: 'bad' },
  insufficient: { label: 'Low balance', cls: 'bad' },
  ip_blocked: { label: 'IP blocked', cls: 'bad' },
  rate_limited: { label: 'Rate limited', cls: 'warn' },
  provider_error: { label: 'Provider error', cls: 'bad' },
  forbidden: { label: 'Forbidden', cls: 'bad' },
  unavailable: { label: 'Paused', cls: 'warn' },
};

function speed(ms: number | null) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

export default async function Page() {
  const user = await requireUser();
  const client = await getClient(user.id);
  if (!client || client.status !== 'approved') {
    return (<><h1>API usage</h1><p className="muted">You do not have API access yet. <Link href="/api-keys">Request it here →</Link></p></>);
  }

  const [{ rows: t }, { rows: svc }, { rows: prices }, { rows: mine }, { rows: daily }, { rows: log }] = await Promise.all([
    query(
      `SELECT count(*)::int AS requests, count(*) FILTER (WHERE outcome='ok')::int AS billed,
              COALESCE(sum(charged_kobo),0)::bigint AS spent,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE outcome='ok') AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE outcome='ok') AS p95
       FROM api_requests WHERE user_id=$1 AND created_at > now() - interval '30 days'`, [user.id]),
    query(
      `SELECT service_key, count(*) FILTER (WHERE outcome='ok')::int AS billed, COALESCE(sum(charged_kobo),0)::bigint AS spent
       FROM api_requests WHERE user_id=$1 AND service_key IS NOT NULL AND created_at > now() - interval '30 days' GROUP BY service_key`, [user.id]),
    query(`SELECT key, amount_kobo FROM prices WHERE key = ANY($1)`, [Object.values(LIST_KEY)]),
    query(`SELECT service_key, amount_kobo FROM api_prices WHERE user_id=$1`, [user.id]),
    query(
      `SELECT to_char(d::date,'DD Mon') AS label,
              COALESCE(count(*) FILTER (WHERE r.outcome='ok'),0)::int AS billed,
              COALESCE(count(*) FILTER (WHERE r.outcome<>'ok'),0)::int AS other
       FROM generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') d
       LEFT JOIN api_requests r ON r.user_id=$1 AND r.created_at::date = d::date
       GROUP BY d ORDER BY d`, [user.id]),
    query(
      `SELECT created_at, endpoint, request_id, outcome, status_code, charged_kobo, duration_ms, service_key
       FROM api_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 15`, [user.id]),
  ]);

  const listKobo: Record<string, number> = {};
  for (const p of prices) listKobo[p.key] = Number(p.amount_kobo);
  const mineKobo: Record<string, number> = {};
  for (const m of mine) mineKobo[m.service_key] = Number(m.amount_kobo);
  const rate = (s: string) => mineKobo[s] ?? listKobo[LIST_KEY[s]] ?? 0;

  const maxDay = Math.max(1, ...daily.map((d) => d.billed + d.other));
  const totals = t[0];

  return (
    <>
      <h1>API usage</h1>
      <p className="muted">What your servers requested and what it cost. You pay only for requests that return a result.</p>

      <div className="statrow">
        <div className="statcard"><div className="l">Requests (30d)</div><div className="n">{totals.requests.toLocaleString()}</div></div>
        <div className="statcard"><div className="l">Billed</div><div className="n">{totals.billed.toLocaleString()}</div><div className="s">{totals.requests ? Math.round((totals.billed / totals.requests) * 100) : 0}% returned a result</div></div>
        <div className="statcard"><div className="l">Spent</div><div className="n">{naira(totals.spent)}</div></div>
        <div className="statcard"><div className="l">Median speed</div><div className="n">{speed(totals.p50 ? Math.round(totals.p50) : null)}</div><div className="s">{speed(totals.p95 ? Math.round(totals.p95) : null)} at the slowest 5%</div></div>
      </div>

      <div className="card">
        <h2>Requests per day</h2>
        <div className="bars" aria-hidden="true">
          {daily.map((d, i) => (
            <div className="col" key={i} title={`${d.label}: ${d.billed} billed, ${d.other} not billed`}>
              <div className="u" style={{ height: `${Math.round((d.other / maxDay) * 150)}px` }} />
              <div className="b" style={{ height: `${Math.max(Math.round((d.billed / maxDay) * 150), d.billed ? 2 : 0)}px` }} />
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8, fontSize: 13 }}>
          <span style={{ flex: '0 0 auto' }}><span style={{ display: 'inline-block', width: 11, height: 11, background: 'var(--accent)', borderRadius: 3, marginRight: 6 }} />Billed</span>
          <span style={{ flex: '0 0 auto' }}><span style={{ display: 'inline-block', width: 11, height: 11, background: '#C9D3CC', border: '1.5px solid #7D8F83', borderRadius: 3, marginRight: 6 }} />Not billed</span>
        </div>
        <div className="scroll" style={{ marginTop: 6 }}><div style={{ display: 'flex', gap: 6, minWidth: 560 }}>{daily.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{d.label.split(' ')[0]}</div>)}</div></div>
      </div>

      <div className="card">
        <h2>By service</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Service</th><th>Billed</th><th>Your rate</th><th>List price</th><th>Spent</th></tr></thead>
            <tbody>
              {['nin', 'match', 'tin'].map((s) => {
                const row = svc.find((x) => x.service_key === s);
                const list = listKobo[LIST_KEY[s]] ?? 0;
                const yours = rate(s);
                return (
                  <tr key={s}>
                    <td><strong>{SVC_LABEL[s]}</strong></td>
                    <td>{(row?.billed ?? 0).toLocaleString()}</td>
                    <td><strong>{naira(yours)}</strong></td>
                    <td className="muted" style={{ textDecoration: yours < list ? 'line-through' : 'none' }}>{naira(list)}</td>
                    <td>{naira(row?.spent ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">Rates are set by Verify Hub for your account. A new rate applies to new requests only.</p>
      </div>

      <div className="card">
        <h2>Recent requests</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Time</th><th>Endpoint</th><th>Request ID</th><th>Result</th><th>Speed</th><th>Charged</th></tr></thead>
            <tbody>
              {log.map((r) => {
                const o = OUTCOME[r.outcome] ?? { label: r.outcome, cls: 'warn' };
                return (
                  <tr key={r.request_id}>
                    <td className="muted">{new Date(r.created_at).toLocaleString('en-NG')}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{r.endpoint}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{r.request_id}</td>
                    <td><span className={'pill ' + o.cls}>{r.status_code} {o.label}</span></td>
                    <td>{speed(r.duration_ms)}</td>
                    <td>{Number(r.charged_kobo) > 0 ? <strong>{naira(r.charged_kobo)}</strong> : '₦0'}</td>
                  </tr>
                );
              })}
              {log.length === 0 && <tr><td colSpan={6} className="muted">No requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
