import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { maskTail } from '@/lib/crypto';
import { lookupNin } from '@/lib/providers';
import { runPaidCheck } from '@/lib/run';

const Body = z.object({
  nin: z.string().transform((s) => s.replace(/\s+/g, '')).pipe(z.string().regex(/^\d{11}$/, 'A NIN has 11 digits')),
});

export const POST = authed(async (req, user) => {
  const { nin } = Body.parse(await req.json());
  const out = await runPaidCheck({
    userId: user.id,
    serviceKey: 'nin',
    priceKey: 'nin_validate',
    channel: 'web',
    inputHint: `NIN ${maskTail(nin)}`,
    exec: () => lookupNin(nin),
    free: user.free_checks,
  });
  if (out.notFound) return json({ found: false, message: 'No record found for this NIN. You were not charged.' });
  if (out.error) return json({ error: out.error }, 502);
  return json({ found: true, checkId: out.checkId, reference: out.reference, identity: out.data });
});
