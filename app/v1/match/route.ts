import { apiJson, authenticate, rejectInvalid } from '@/lib/apiauth';
import { runApiCheck } from '@/lib/apirun';
import { compareIdentities } from '@/lib/compare';
import { lookupNin, lookupPassport } from '@/lib/providers';

const ENDPOINT = 'POST /v1/match';
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

type MatchData = ReturnType<typeof compareIdentities>;

export async function POST(req: Request) {
  const auth = await authenticate(req, ENDPOINT);
  if (!auth.ok) return auth.res;
  const { ctx } = auth;

  const b = await req.json().catch(() => null);
  const nin = String(b?.nin ?? '').replace(/\s+/g, '');
  const ninDob = b?.nin_dob;
  const passport = String(b?.passport_number ?? '').toUpperCase().replace(/\s+/g, '');
  const passportDob = b?.passport_dob;
  if (!/^\d{11}$/.test(nin) || !isDate(ninDob) || !/^[A-Z]\d{8}$/.test(passport) || !isDate(passportDob)) {
    return rejectInvalid(ctx, ENDPOINT, 'match', 'Provide nin, nin_dob (YYYY-MM-DD), passport_number (e.g. A12345678) and passport_dob (YYYY-MM-DD).');
  }

  const out = await runApiCheck<MatchData>({
    key: ctx.key,
    client: ctx.client,
    serviceKey: 'match',
    endpoint: ENDPOINT,
    idempotencyKey: req.headers.get('idempotency-key'),
    ip: ctx.ip,
    exec: async () => {
      const n = await lookupNin(nin);
      if (!n.found) return { found: false, reason: 'No NIN record matches these details.' };
      if (n.data.dob !== ninDob) return { found: false, reason: 'The date of birth does not match the NIN record.' };
      const p = await lookupPassport(passport, passportDob);
      if (!p.found) return { found: false, reason: 'The NIN was found but no passport record matches.' };
      return { found: true, data: compareIdentities(n.data, p.data) };
    },
    shape: (c) => ({ verdict: c.verdict, matched: c.matched, total: c.total, fields: c.fields }),
  });
  return apiJson(out.body, out.status);
}
