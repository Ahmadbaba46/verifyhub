import ApiKeysPanel from '@/components/ApiKeysPanel';
import { requireUser } from '@/lib/auth';
import { apiServices, getClientFull } from '@/lib/apiclient';
import { query } from '@/lib/db';
import { naira } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await requireUser();
  const client = await getClientFull(user.id);
  const services = await apiServices();

  if (!client) {
    return <ApiKeysPanel access="none" services={services} keys={[]} limits={null} balance={naira(user.balance_kobo)} usage={null} />;
  }

  const [{ rows: keys }, { rows: usage }] = await Promise.all([
    query(
      `SELECT id, name, env, display, services, allowed_ips, daily_cap_kobo, rpm_limit, status, grace_until, last_used_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id],
    ),
    query(
      `SELECT count(*)::int AS requests,
              count(*) FILTER (WHERE outcome = 'ok')::int AS billed,
              COALESCE(sum(charged_kobo),0)::bigint AS spent
       FROM api_requests WHERE user_id = $1 AND created_at > now() - interval '30 days'`,
      [user.id],
    ),
  ]);

  return (
    <ApiKeysPanel
      access={client.status}
      services={services}
      balance={naira(user.balance_kobo)}
      limits={{
        maxKeys: client.max_keys,
        rpmLimit: client.rpm_limit,
        requireIp: client.require_ip_allowlist,
        allowTest: client.allow_test,
        dailyCapCeil: client.daily_cap_kobo != null ? Number(client.daily_cap_kobo) / 100 : null,
      }}
      usage={{ requests: usage[0].requests, billed: usage[0].billed, spent: naira(usage[0].spent) }}
      keys={keys.map((k) => ({
        id: k.id,
        name: k.name,
        env: k.env,
        display: k.display,
        services: k.services,
        allowedIps: k.allowed_ips,
        dailyCap: k.daily_cap_kobo != null ? naira(k.daily_cap_kobo) : null,
        rpm: k.rpm_limit,
        status: k.status,
        rotated: Boolean(k.grace_until),
        lastUsed: k.last_used_at ? new Date(k.last_used_at).toISOString() : null,
      }))}
    />
  );
}
