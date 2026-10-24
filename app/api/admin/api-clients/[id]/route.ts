import crypto from 'node:crypto';
import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { query, withTx } from '@/lib/db';
import { credit } from '@/lib/ledger';
import { parseNairaToKobo } from '@/lib/money';
import { SERVICES } from '@/lib/apiclient';

const na = (n: unknown) => (n === undefined || n === null || String(n).trim() === '' ? null : parseNairaToKobo(n as string | number));

const Bonus = z.object({
  type: z.enum(['none', 'topup_percent', 'free_monthly']),
  percent: z.coerce.number().min(0).max(100).optional(),
  min: z.union([z.string(), z.number()]).optional(),
  max: z.union([z.string(), z.number()]).optional(),
  count: z.coerce.number().int().min(0).optional(),
});

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('suspend') }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('revoke_key'), keyId: z.string().uuid() }),
  z.object({ action: z.literal('grant_credit'), amount: z.union([z.string(), z.number()]), reason: z.string().trim().min(3).max(200) }),
  z.object({
    action: z.literal('save'),
    prices: z.record(z.enum(SERVICES), z.union([z.string(), z.number()])).optional().default({}),
    bonus: Bonus.optional(),
    limits: z.object({
      rpm_limit: z.coerce.number().int().positive().max(100000),
      max_keys: z.coerce.number().int().positive().max(100),
      daily_cap: z.union([z.string(), z.number()]).optional(),
      require_ip_allowlist: z.boolean(),
      allow_test: z.boolean(),
    }),
    note: z.string().trim().max(300).optional().default(''),
  }),
]);

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, ctx: Ctx) =>
  authed(
    async (_r, admin) => {
      const { id } = await ctx.params;
      const b = Body.parse(await req.json());

      const exists = await query('SELECT user_id FROM api_clients WHERE user_id = $1', [id]);
      if (!exists.rowCount) return json({ error: 'Not an API client' }, 404);

      if (b.action === 'approve') {
        await query(`UPDATE api_clients SET status = 'approved', approved_at = now(), approved_by = $2 WHERE user_id = $1`, [id, admin.id]);
      } else if (b.action === 'suspend') {
        await query(`UPDATE api_clients SET status = 'suspended' WHERE user_id = $1`, [id]);
      } else if (b.action === 'reactivate') {
        await query(`UPDATE api_clients SET status = 'approved' WHERE user_id = $1`, [id]);
      } else if (b.action === 'revoke_key') {
        const r = await query(`UPDATE api_keys SET status = 'revoked', revoked_at = now(), grace_until = NULL WHERE id = $1 AND user_id = $2 AND status = 'active'`, [b.keyId, id]);
        if (!r.rowCount) return json({ error: 'Key not found' }, 404);
      } else if (b.action === 'grant_credit') {
        const kobo = parseNairaToKobo(b.amount);
        if (!kobo || kobo <= 0) return json({ error: 'Enter a valid amount' }, 400);
        await withTx((tx) =>
          credit(tx, { userId: id, amountKobo: kobo, kind: 'bonus', reference: 'ADMIN-BONUS', key: `adminbonus:${crypto.randomUUID()}`, meta: { reason: b.reason, by: admin.id } }),
        );
      } else if (b.action === 'save') {
        const dailyCap = na(b.limits.daily_cap);
        await withTx(async (tx) => {
          for (const svc of SERVICES) {
            const raw = (b.prices as Record<string, unknown>)[svc];
            if (raw === undefined || String(raw).trim() === '') {
              await tx.query('DELETE FROM api_prices WHERE user_id = $1 AND service_key = $2', [id, svc]); // revert to list price
              continue;
            }
            const kobo = parseNairaToKobo(raw as string | number);
            if (kobo === null) throw new Error(`Invalid price for ${svc}`);
            await tx.query(
              `INSERT INTO api_prices (user_id, service_key, amount_kobo, updated_by) VALUES ($1,$2,$3,$4)
               ON CONFLICT (user_id, service_key) DO UPDATE SET amount_kobo = EXCLUDED.amount_kobo, updated_at = now(), updated_by = EXCLUDED.updated_by`,
              [id, svc, kobo, admin.id],
            );
          }
          if (b.bonus) {
            const bn: Record<string, unknown> = { type: b.bonus.type };
            if (b.bonus.type === 'topup_percent') {
              bn.percent = b.bonus.percent ?? 0;
              bn.min_kobo = na(b.bonus.min) ?? 0;
              const mx = na(b.bonus.max);
              if (mx) bn.max_kobo = mx;
            } else if (b.bonus.type === 'free_monthly') {
              bn.count = b.bonus.count ?? 0;
            }
            await tx.query('UPDATE api_clients SET bonus = $2::jsonb WHERE user_id = $1', [id, JSON.stringify(bn)]);
          }
          await tx.query(
            `UPDATE api_clients SET rpm_limit = $2, max_keys = $3, daily_cap_kobo = $4, require_ip_allowlist = $5, allow_test = $6, note = $7 WHERE user_id = $1`,
            [id, b.limits.rpm_limit, b.limits.max_keys, dailyCap, b.limits.require_ip_allowlist, b.limits.allow_test, b.note],
          );
        });
      }

      await query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, $2, $3)`, [admin.id, `api_client.${b.action}`, JSON.stringify({ client: id, ...('keyId' in b ? { keyId: b.keyId } : {}) })]);
      return json({ ok: true });
    },
    { admin: true },
  )(req);
