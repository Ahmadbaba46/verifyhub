import { authed, json } from '@/lib/api';
import { requestAccess } from '@/lib/apiclient';
import { query } from '@/lib/db';

/** A user asks for API access. Creates a pending request for the admin to approve. */
export const POST = authed(async (_req, user) => {
  const status = await requestAccess(user.id);
  await query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, 'api.request_access', '{}')`, [user.id]);
  return json({ ok: true, status });
});
