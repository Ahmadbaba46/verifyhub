import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export default async function Page() {
  const user = await requireUser();
  const [{ rows: svc }, { rows: recent }] = await Promise.all([
    query(`SELECT s.key, s.label, s.description, s.enabled, s.web_enabled, p.amount_kobo FROM services s
           JOIN prices p ON p.service_key = s.key AND p.key IN ('nin_validate','bvn_validate','match_check','tin_lookup') ORDER BY s.sort, s.key`),
    query(`SELECT reference, status, input_hint, created_at FROM checks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [user.id]),
  ]);
  const href: Record<string, string> = { nin: '/nin', bvn: '/bvn', match: '/match', tin: '/tin' };
  return (
    <>
      <h1>Hello, {user.name.split(' ')[0]}</h1>
      <p className="muted">Wallet balance <b>{naira(user.balance_kobo)}</b> · Tier {user.tier}</p>
      {user.free_checks
        ? <div className="promo">Your account runs checks free for testing — no wallet funding needed.</div>
        : user.balance_kobo < 50000 && <div className="promo">Your balance is low. <Link href="/wallet">Fund your wallet</Link> to keep running checks.</div>}
      <div className="grid" style={{ marginTop: 16 }}>
        {svc.map((s) => (
          <div className="card" key={s.key}>
            <h2>{s.label}</h2><p className="muted">{s.description}</p>
            <p><b>{naira(s.amount_kobo)}</b> per check {!(s.enabled && s.web_enabled) && <span className="pill warn">paused</span>}</p>
            <Link className="btn" href={href[s.key] ?? '/dashboard'}>Open</Link>
          </div>
        ))}
      </div>
      <div className="card"><h2>Recent checks</h2>
        {recent.length ? <table><tbody>{recent.map((r) => <tr key={r.reference}><td>{r.input_hint}</td><td>{r.status}</td><td>{new Date(r.created_at).toLocaleString('en-NG')}</td></tr>)}</tbody></table> : <p className="muted">Nothing yet. Run your first check above.</p>}
      </div>
    </>
  );
}
