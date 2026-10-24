import { apiJson, authenticate, rejectInvalid } from '@/lib/apiauth';
import { runApiCheck } from '@/lib/apirun';
import { lookupTin } from '@/lib/providers';
import type { TinRecord } from '@/lib/providers/types';
import { getSettings } from '@/lib/settings';

const ENDPOINT = 'POST /v1/tin/lookup';

export async function POST(req: Request) {
  const auth = await authenticate(req, ENDPOINT);
  if (!auth.ok) return auth.res;
  const { ctx } = auth;

  const b = await req.json().catch(() => null);
  const type = String(b?.taxpayer_type ?? '');
  const nin = b?.nin ? String(b.nin).replace(/\s+/g, '') : '';
  const rc = b?.rc ? String(b.rc).toUpperCase().replace(/\s+/g, '') : '';
  const types = (await getSettings()).taxpayer_types;

  if (!types.includes(type)) return rejectInvalid(ctx, ENDPOINT, 'tin', 'taxpayer_type must be one of: ' + types.join(', ') + '.');
  if (Boolean(nin) === Boolean(rc)) return rejectInvalid(ctx, ENDPOINT, 'tin', 'Provide exactly one of nin or rc.');
  if (nin && !/^\d{11}$/.test(nin)) return rejectInvalid(ctx, ENDPOINT, 'tin', 'A NIN must be 11 digits.');
  if (rc && !/^(RC)?\d{4,9}$/.test(rc)) return rejectInvalid(ctx, ENDPOINT, 'tin', 'An RC number looks like RC123456.');

  const via = nin ? 'nin' : 'rc';
  const out = await runApiCheck<TinRecord>({
    key: ctx.key,
    client: ctx.client,
    serviceKey: 'tin',
    endpoint: ENDPOINT,
    idempotencyKey: req.headers.get('idempotency-key'),
    ip: ctx.ip,
    exec: () => lookupTin({ nin: nin || undefined, rc: rc || undefined, type }),
    shape: (t) => ({
      tin: t.tin,
      registered_name: t.registeredName,
      taxpayer_type: t.taxpayerType,
      tax_office: t.taxOffice,
      status: t.status,
      found_by: via,
    }),
  });
  return apiJson(out.body, out.status);
}
