import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { maskTail } from '@/lib/crypto';
import { lookupBvn } from '@/lib/providers';
import { runPaidCheck } from '@/lib/run';

const Body = z.object({
  bvn: z.string().transform((s) => s.replace(/\s+/g, '')).pipe(z.string().regex(/^\d{11}$/, 'A BVN has 11 digits')),
});

export const POST = authed(async (req, user) => {
  const { bvn } = Body.parse(await req.json());
  const out = await runPaidCheck({
    userId: user.id,
    serviceKey: 'bvn',
    priceKey: 'bvn_validate',
    channel: 'web',
    inputHint: `BVN ${maskTail(bvn)}`,
    exec: () => lookupBvn(bvn, user.email),
    free: user.role === 'admin',
  });
  if (out.notFound) return json({ found: false, message: 'No record found for this BVN. You were not charged.' });
  if (out.error) return json({ error: out.error }, 502);
  return json({ found: true, checkId: out.checkId, reference: out.reference, bvn: out.data });
});
