import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminClientDetail from '@/components/AdminClientDetail';
import { requireAdmin } from '@/lib/auth';
import { getClientFull } from '@/lib/apiclient';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export const dynamic = 'force-dynamic';

const LIST_KEY: Record<string, string> = { nin: 'nin_validate', match: 'match_check', tin: 'tin_lookup' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await getClientFull(id);
  if (!c) notFound();

  const [{ rows: prices }, { rows: apiPrices }, { rows: keys }, { rows: snap }, { rows: perSvc }, { rows: blocked }] = await Promise.all([
    query(`SELECT key, amount_kobo FROM prices WHERE key = ANY($1)`, [Object.values(LIST_KEY)]),
    query(`SELECT service_key, amount_kobo FROM api_prices WHERE user_id = $1`, [id]),
    query(`SELECT id, name, env, display, services, allowed_ips, status, grace_until, last_used_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`, [id]),
    query(
      `SELECT count(*)::int AS requests, count(*) FILTER (WHERE outcome='ok')::int AS billed, COALESCE(sum(charged_kobo),0)::bigint AS revenue
       FROM api_requests WHERE user_id = $1 AND created_at > now() - interval '30 days'`, [id]),
    query(
      `SELECT service_key, count(*) FILTER (WHERE outcome='ok')::int AS billed FROM api_requests
       WHERE user_id=$1 AND service_key IS NOT NULL AND created_at > now() - interval '30 days' GROUP BY service_key`, [id]),
    query(`SELECT created_at, ip FROM api_requests WHERE user_id=$1 AND outcome='ip_blocked' ORDER BY created_at DESC LIMIT 3`, [id]),
  ]);

  const listKobo: Record<string, number> = {};
  for (const p of prices) listKobo[p.key] = Number(p.amount_kobo);
  const agreedKobo: Record<string, number> = {};
  for (const r of apiPrices) agreedKobo[r.service_key] = Number(r.amount_kobo);
  const billedBySvc: Record<string, number> = {};
  for (const r of perSvc) billedBySvc[r.service_key] = r.billed;

  const toN = (k: number) => String(k / 100);
  const discount = (['nin', 'match', 'tin'] as const).reduce((a, s) => {
    const list = listKobo[LIST_KEY[s]] ?? 0;
    const paid = agreedKobo[s] ?? list;
    return a + Math.max(list - paid, 0) * (billedBySvc[s] ?? 0);
  }, 0);

  return (
    <>
      <Link href="/admin/api-clients" style={{ fontSize: 14, fontWeight: 600 }}>← All API clients</Link>
      <AdminClientDetail
        id={id}
        name={c.name}
        email={c.email}
        status={c.status}
        balance={naira(c.balance_kobo)}
        listPrices={{ nin: toN(listKobo.nin_validate ?? 0), match: toN(listKobo.match_check ?? 0), tin: toN(listKobo.tin_lookup ?? 0) }}
        agreedPrices={{ nin: agreedKobo.nin != null ? toN(agreedKobo.nin) : '', match: agreedKobo.match != null ? toN(agreedKobo.match) : '', tin: agreedKobo.tin != null ? toN(agreedKobo.tin) : '' }}
        bonus={c.bonus}
        limits={{ rpm_limit: c.rpm_limit, max_keys: c.max_keys, daily_cap: c.daily_cap_kobo != null ? toN(Number(c.daily_cap_kobo)) : '', require_ip_allowlist: c.require_ip_allowlist, allow_test: c.allow_test }}
        note={c.note}
        snapshot={{ requests: snap[0].requests, billed: snap[0].billed, revenue: naira(snap[0].revenue), discount: naira(discount) }}
        keys={keys.map((k) => ({ id: k.id, name: k.name, env: k.env, display: k.display, allowedIps: k.allowed_ips, status: k.status, rotated: Boolean(k.grace_until), lastUsed: k.last_used_at ? new Date(k.last_used_at).toISOString() : null }))}
        blocked={blocked.map((bd) => ({ at: new Date(bd.created_at).toLocaleString('en-NG'), ip: bd.ip }))}
      />
    </>
  );
}
