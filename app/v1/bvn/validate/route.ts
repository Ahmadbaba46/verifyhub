import { apiJson, authenticate, rejectInvalid } from '@/lib/apiauth';
import { runApiCheck } from '@/lib/apirun';
import type { BvnRecord } from '@/lib/providers/types';
import { lookupBvn } from '@/lib/providers';

const ENDPOINT = 'POST /v1/bvn/validate';

export async function POST(req: Request) {
  const auth = await authenticate(req, ENDPOINT);
  if (!auth.ok) return auth.res;
  const { ctx } = auth;

  const body = await req.json().catch(() => null);
  const bvn = String(body?.bvn ?? '').replace(/\s+/g, '');
  if (!/^\d{11}$/.test(bvn)) return rejectInvalid(ctx, ENDPOINT, 'bvn', 'A BVN must be 11 digits.');

  const out = await runApiCheck<BvnRecord>({
    key: ctx.key,
    client: ctx.client,
    serviceKey: 'bvn',
    endpoint: ENDPOINT,
    idempotencyKey: req.headers.get('idempotency-key'),
    ip: ctx.ip,
    exec: () => lookupBvn(bvn),
    shape: (d) => ({
      bvn: d.bvn,
      first_name: d.firstName,
      middle_name: d.middleName,
      last_name: d.lastName,
      date_of_birth: d.dateOfBirth,
      gender: d.gender,
      phone_number: d.phoneNumber,
      address: d.address,
    }),
  });
  return apiJson(out.body, out.status);
}
