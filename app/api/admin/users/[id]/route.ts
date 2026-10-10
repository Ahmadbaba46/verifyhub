import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { withTx } from '@/lib/db';
import { credit } from '@/lib/ledger';
import { parseNairaToKobo } from '@/lib/money';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('credit'), amount: z.union([z.string(), z.number()]), reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal('suspend') }),
  z.object({ action: z.literal('reactivate') }),
]);

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, ctx: Ctx) =>
  authed(
    async (r, admin) => {
      const { id } = await ctx.params;
      const b = Body.parse(await r.json());
      if (b.action === 'credit') {
        const kobo = parseNairaToKobo(b.amount);
        if (!kobo) return json({ error: 'Enter a valid amount' }, 400);
        await withTx(async (tx) => {
          // Key includes the time so two deliberate credits are two entries; double-clicks within the same second collapse.
          await credit(tx, {
            userId: id, amountKobo: kobo, kind: 'adjustment', reference: 'ADMIN-CREDIT',
            key: `adj:${id}:${admin.id}:${kobo}:${Math.floor(Date.now() / 1000)}`,
            meta: { by: admin.id, reason: b.reason },
          });
          await tx.query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, 'wallet.credit', $2)`, [admin.id, JSON.stringify({ user: id, kobo, reason: b.reason })]);
        });
        return json({ ok: true });
      }
      if (id === admin.id) return json({ error: 'You cannot change your own status' }, 400);
      await withTx(async (tx) => {
        await tx.query(`UPDATE users SET status = $2 WHERE id = $1`, [id, b.action === 'suspend' ? 'suspended' : 'active']);
        await tx.query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, $2, $3)`, [admin.id, `user.${b.action}`, JSON.stringify({ user: id })]);
      });
      return json({ ok: true });
    },
    { admin: true },
  )(req);
