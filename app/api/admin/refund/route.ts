import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { withTx } from '@/lib/db';
import { refundCharge } from '@/lib/ledger';

const Body = z.object({ entryId: z.string().uuid(), reason: z.string().trim().min(3).max(200) });

/** Manual refund of one charge. Refunding the same charge twice does nothing the second time. */
export const POST = authed(
  async (req, admin) => {
    const b = Body.parse(await req.json());
    const res = await withTx(async (tx) => {
      const r = await refundCharge(tx, b.entryId, b.reason);
      await tx.query(`UPDATE checks SET status = 'refunded', error = $2 WHERE charge_entry_id = $1`, [b.entryId, b.reason]);
      await tx.query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, 'refund', $2)`, [admin.id, JSON.stringify(b)]);
      return r;
    });
    return json({ ok: true, alreadyRefunded: res.replay });
  },
  { admin: true },
);
