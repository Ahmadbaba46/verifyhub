import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { generateKey } from '@/lib/apikeys';
import { query, withTx } from '@/lib/db';

const Body = z.object({ action: z.enum(['rotate', 'revoke']) });
type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, ctx: Ctx) =>
  authed(async (_r, user) => {
    const { id } = await ctx.params;
    const { action } = Body.parse(await req.json());

    const { rows } = await query(`SELECT * FROM api_keys WHERE id = $1 AND user_id = $2`, [id, user.id]);
    const key = rows[0];
    if (!key) return json({ error: 'Key not found' }, 404);
    if (key.status !== 'active') return json({ error: 'This key is no longer active.' }, 400);

    if (action === 'revoke') {
      await query(`UPDATE api_keys SET status = 'revoked', revoked_at = now(), grace_until = NULL WHERE id = $1`, [id]);
      await query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, 'apikey.revoke', $2)`, [user.id, JSON.stringify({ keyId: id })]);
      return json({ ok: true });
    }

    // Rotate: mint a new secret and let the old key keep working for 24 hours.
    const { secret, hash, display } = generateKey(key.env);
    const newId = await withTx(async (tx) => {
      const ins = await tx.query(
        `INSERT INTO api_keys (user_id, name, env, hash, display, services, allowed_ips, daily_cap_kobo, rpm_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [user.id, key.name, key.env, hash, display, key.services, key.allowed_ips, key.daily_cap_kobo, key.rpm_limit],
      );
      await tx.query(`UPDATE api_keys SET grace_until = now() + interval '24 hours' WHERE id = $1`, [id]);
      return ins.rows[0].id;
    });
    await query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, 'apikey.rotate', $2)`, [user.id, JSON.stringify({ oldKeyId: id, newKeyId: newId })]);
    return json({ ok: true, id: newId, name: key.name, env: key.env, display, secret });
  })(req);
