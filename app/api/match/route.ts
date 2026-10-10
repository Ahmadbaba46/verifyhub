import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { compareIdentities } from '@/lib/compare';
import { maskTail } from '@/lib/crypto';
import { lookupNin, lookupPassport } from '@/lib/providers';
import type { Identity } from '@/lib/providers/types';
import { runPaidCheck } from '@/lib/run';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD');
const Body = z.object({
  nin: z.string().transform((s) => s.replace(/\s+/g, '')).pipe(z.string().regex(/^\d{11}$/, 'A NIN has 11 digits')),
  ninDob: date,
  passportNumber: z.string().trim().toUpperCase().regex(/^[A-Z]\d{8}$/, 'A passport number looks like A12345678'),
  passportDob: date,
});

/**
 * Order matters and mirrors the provider flow: NIN first; only if it is found do we call the passport provider,
 * and only if both are found do you pay. Otherwise the charge is refunded automatically.
 */
export const POST = authed(async (req, user) => {
  const b = Body.parse(await req.json());
  type Result = { nin: Identity; passport: Identity; comparison: ReturnType<typeof compareIdentities> };

  let missing: 'nin' | 'passport' | null = null;
  const out = await runPaidCheck<Result>({
    userId: user.id,
    serviceKey: 'match',
    priceKey: 'match_check',
    channel: 'web',
    inputHint: `NIN ${maskTail(b.nin)} / passport ${maskTail(b.passportNumber)}`,
    exec: async () => {
      const nin = await lookupNin(b.nin);
      if (!nin.found) {
        missing = 'nin';
        return { found: false, reason: 'NIN not found' };
      }
      // The caller states the DOB on the NIN. A different DOB than the record means the inputs do not belong together.
      if (nin.data.dob !== b.ninDob) {
        missing = 'nin';
        return { found: false, reason: 'NIN date of birth does not match the record' };
      }
      const passport = await lookupPassport(b.passportNumber, b.passportDob);
      if (!passport.found) {
        missing = 'passport';
        return { found: false, reason: 'Passport not found' };
      }
      return { found: true, data: { nin: nin.data, passport: passport.data, comparison: compareIdentities(nin.data, passport.data) } };
    },
  });

  if (out.notFound) {
    const message =
      missing === 'passport'
        ? 'The NIN was found but no passport record matches those details. You were not charged.'
        : 'No NIN record matches those details. You were not charged.';
    return json({ found: false, message });
  }
  if (out.error) return json({ error: out.error }, 502);
  return json({ found: true, checkId: out.checkId, reference: out.reference, ...out.data });
});
