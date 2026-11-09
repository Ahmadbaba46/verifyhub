import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { query } from '@/lib/db';
import { DOCS, DocKey, renderDocument } from '@/lib/documents';
import { buyDocument, loadCheck } from '@/lib/run';

const Doc = z.enum(['nin_slip', 'tin_slip', 'tin_certificate']);

type Ctx = { params: Promise<{ id: string }> };

async function prepare(userId: string, id: string, doc: DocKey) {
  const c = await loadCheck(userId, id);
  if (!c || c.row.status !== 'completed') return { error: json({ error: 'Check not found' }, 404) } as const;
  if (c.expired || !c.data) return { error: json({ error: 'This result has expired. Please run the check again.' }, 410) } as const;
  const spec = DOCS[doc];
  if (c.row.service_key !== spec.service) return { error: json({ error: 'That document does not belong to this check' }, 400) } as const;
  if (spec.needsVia) {
    const via = (c.data as { __via?: string }).__via;
    // TIN results remember how they were found so slips (NIN) and certificates (RC) are not mixed up.
    if (via && via !== spec.needsVia) return { error: json({ error: spec.needsVia === 'rc' ? 'Certificates are only available for RC lookups' : 'Slips are only available for NIN lookups' }, 400) } as const;
  }
  return { c, spec, error: null } as const;
}

/** Buy a document. Charged once per check; buying again returns the same entry without charging. */
export const POST = (req: Request, ctx: Ctx) =>
  authed(async (_r, user) => {
    const { id } = await ctx.params;
    const { doc } = z.object({ doc: Doc }).parse(await req.json());
    const p = await prepare(user.id, id, doc);
    if (p.error) return p.error;
    await buyDocument({ userId: user.id, checkId: id, priceKey: p.spec.priceKey, docKey: doc, free: user.free_checks });
    return json({ ok: true, url: `/api/checks/${id}/document?doc=${doc}` });
  })(req);

/** Download a document you have already paid for. Never charges. */
export const GET = (req: Request, ctx: Ctx) =>
  authed(async (r, user) => {
    const { id } = await ctx.params;
    const doc = Doc.parse(new URL(r.url).searchParams.get('doc'));
    if (!user.free_checks) {
      const paid = await query('SELECT 1 FROM ledger_entries WHERE idempotency_key = $1 AND user_id = $2', [`${doc}:${id}`, user.id]);
      if (!paid.rowCount) return json({ error: 'Buy this document first' }, 402);
    }
    const p = await prepare(user.id, id, doc);
    if (p.error) return p.error;
    const { __via, ...data } = p.c.data as Record<string, unknown>;
    const pdf = await renderDocument(doc, data, p.c.row.reference);
    return new Response(Buffer.from(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${p.spec.filename}-${p.c.row.reference}.pdf"`,
        'cache-control': 'private, no-store',
      },
    });
  })(req);
