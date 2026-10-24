import { apiJson, authenticate, rejectInvalid } from '@/lib/apiauth';
import { runApiCheck } from '@/lib/apirun';
import type { Identity } from '@/lib/providers/types';
import { lookupNin } from '@/lib/providers';

const ENDPOINT = 'POST /v1/nin/validate';

export async function POST(req: Request) {
  const auth = await authenticate(req, ENDPOINT);
  if (!auth.ok) return auth.res;
  const { ctx } = auth;

  const body = await req.json().catch(() => null);
  const nin = String(body?.nin ?? '').replace(/\s+/g, '');
  if (!/^\d{11}$/.test(nin)) return rejectInvalid(ctx, ENDPOINT, 'nin', 'A NIN must be 11 digits.');

  const out = await runApiCheck<Identity>({
    key: ctx.key,
    client: ctx.client,
    serviceKey: 'nin',
    endpoint: ENDPOINT,
    idempotencyKey: req.headers.get('idempotency-key'),
    ip: ctx.ip,
    exec: () => lookupNin(nin),
    shape: (d) => ({
      surname: d.surname,
      first_name: d.firstName,
      middle_name: d.middleName,
      date_of_birth: d.dob,
      gender: d.gender,
      state_of_origin: d.stateOfOrigin ?? null,
    }),
  });
  return apiJson(out.body, out.status);
}
