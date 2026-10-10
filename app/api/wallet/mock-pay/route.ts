import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { query } from '@/lib/db';
import { completeFunding } from '@/lib/funding';

const Body = z.object({ reference: z.string().min(4).max(60) });

/** Development only: pretends the gateway confirmed payment. Disabled unless PAYMENT_MODE=mock. */
export const POST = authed(async (req, user) => {
  if (process.env.PAYMENT_MODE !== 'mock') return json({ error: 'Not available' }, 404);
  const { reference } = Body.parse(await req.json());
  const { rows } = await query('SELECT amount_kobo FROM funding_requests WHERE provider_ref = $1 AND user_id = $2', [reference, user.id]);
  if (!rows.length) return json({ error: 'Unknown reference' }, 404);
  const res = await completeFunding(reference, Number(rows[0].amount_kobo));
  return json(res);
});
