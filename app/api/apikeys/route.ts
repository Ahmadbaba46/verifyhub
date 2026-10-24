import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { generateKey } from '@/lib/apikeys';
import { apiServices, getClient, SERVICES } from '@/lib/apiclient';
import { query } from '@/lib/db';
import { parseNairaToKobo } from '@/lib/money';

const Body = z.object({
  name: z.string().trim().min(2, 'Give the key a name').max(60),
  env: z.enum(['live', 'test']),
  services: z.array(z.enum(SERVICES)).min(1, 'Choose at least one service'),
  allowed_ips: z.array(z.string().trim()).max(50).optional().default([]),
  daily_cap: z.union([z.string(), z.number()]).optional(),
  rpm: z.coerce.number().int().positive().optional(),
});

const IP = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

/** Create an API key. The full secret is returned once and never stored. */
export const POST = authed(async (req, user) => {
  const client = await getClient(user.id);
  if (!client || client.status !== 'approved') return json({ error: 'API access is not enabled for your account yet.' }, 403);

  const full = (await query('SELECT max_keys, require_ip_allowlist, allow_test, rpm_limit, daily_cap_kobo FROM api_clients WHERE user_id = $1', [user.id])).rows[0];
  const b = Body.parse(await req.json());

  if (b.env === 'test' && !full.allow_test) return json({ error: 'Test keys are not allowed on your account.' }, 400);

  const { rows: cnt } = await query(`SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1 AND status = 'active'`, [user.id]);
  if (cnt[0].n >= full.max_keys) return json({ error: `You have reached your limit of ${full.max_keys} keys.` }, 400);

  const open = new Set((await apiServices()).map((s) => s.key));
  const services = b.services.filter((s) => open.has(s));
  if (!services.length) return json({ error: 'None of the chosen services are available over the API right now.' }, 400);

  const ips = b.allowed_ips.map((s) => s.trim()).filter(Boolean);
  for (const ip of ips) if (!IP.test(ip)) return json({ error: `"${ip}" is not a valid IP address.` }, 400);
  if (b.env === 'live' && full.require_ip_allowlist && !ips.length) return json({ error: 'Live keys must list at least one server IP address.' }, 400);

  let dailyCap: number | null = null;
  if (b.daily_cap !== undefined && String(b.daily_cap).trim() !== '') {
    dailyCap = parseNairaToKobo(b.daily_cap);
    if (dailyCap === null) return json({ error: 'The daily spend cap is not a valid amount.' }, 400);
    if (full.daily_cap_kobo != null && dailyCap > Number(full.daily_cap_kobo)) return json({ error: `The daily cap cannot exceed ${Number(full.daily_cap_kobo) / 100} naira.` }, 400);
  }

  let rpm: number | null = null;
  if (b.rpm !== undefined) {
    rpm = b.rpm;
    if (rpm > full.rpm_limit) return json({ error: `The rate cannot exceed ${full.rpm_limit} requests per minute.` }, 400);
  }

  const { secret, hash, display } = generateKey(b.env);
  const { rows } = await query(
    `INSERT INTO api_keys (user_id, name, env, hash, display, services, allowed_ips, daily_cap_kobo, rpm_limit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [user.id, b.name, b.env, hash, display, services, ips, dailyCap, rpm],
  );
  await query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, 'apikey.create', $2)`, [user.id, JSON.stringify({ keyId: rows[0].id, env: b.env, services })]);

  // The only time the secret is shown.
  return json({ ok: true, id: rows[0].id, name: b.name, env: b.env, display, secret });
});
