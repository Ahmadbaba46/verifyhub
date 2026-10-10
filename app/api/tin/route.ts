import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { maskTail } from '@/lib/crypto';
import { lookupTin } from '@/lib/providers';
import { runPaidCheck } from '@/lib/run';
import { getSettings } from '@/lib/settings';

const Body = z
  .object({
    type: z.string({ required_error: 'Choose a taxpayer type' }).min(1, 'Choose a taxpayer type'),
    nin: z.string().optional(),
    rc: z.string().trim().toUpperCase().optional(),
  })
  .refine((b) => Boolean(b.nin) !== Boolean(b.rc), { message: 'Give either a NIN or an RC number' });

export const POST = authed(async (req, user) => {
  const b = Body.parse(await req.json());
  const settings = await getSettings();
  if (!settings.taxpayer_types.includes(b.type)) return json({ error: 'Choose a taxpayer type' }, 400);

  let nin: string | undefined;
  let rc: string | undefined;
  if (b.nin) {
    nin = b.nin.replace(/\s+/g, '');
    if (!/^\d{11}$/.test(nin)) return json({ error: 'A NIN has 11 digits' }, 400);
  } else {
    rc = b.rc!;
    if (!/^(RC)?\d{4,9}$/.test(rc)) return json({ error: 'An RC number looks like RC123456' }, 400);
  }

  const out = await runPaidCheck({
    userId: user.id,
    serviceKey: 'tin',
    priceKey: 'tin_lookup',
    channel: 'web',
    inputHint: nin ? `NIN ${maskTail(nin)}` : `RC ${rc}`,
    exec: async () => {
      const r = await lookupTin({ nin, rc, type: b.type });
      // Remember how it was found: NIN lookups get a slip, RC lookups get a certificate.
      return r.found ? { found: true as const, data: { ...r.data, __via: nin ? 'nin' : 'rc' } } : r;
    },
  });
  if (out.notFound) return json({ found: false, message: 'No tax ID found for those details. You were not charged.' });
  if (out.error) return json({ error: out.error }, 502);
  const { __via, ...tin } = out.data as Record<string, unknown>;
  return json({ found: true, checkId: out.checkId, reference: out.reference, tin, via: __via });
});
