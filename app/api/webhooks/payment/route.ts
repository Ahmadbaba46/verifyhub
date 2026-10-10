import crypto from 'node:crypto';
import { json } from '@/lib/api';
import { completeFunding } from '@/lib/funding';

/**
 * Payment webhook. This is written for a generic gateway: HMAC-SHA512 of the raw body in `x-signature`,
 * body { reference, amount_kobo, status: "success" }. When you pick a gateway, adjust the header name,
 * the signature scheme and the field names here. Everything after verification stays the same.
 * Always responds 200 for validly signed requests so the gateway does not retry forever.
 */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Webhook not configured' }, 503);

  const raw = await req.text();
  const sig = req.headers.get('x-signature') ?? '';
  const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return json({ error: 'Bad signature' }, 401);

  let body: { reference?: string; amount_kobo?: number; status?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Bad body' }, 400);
  }
  if (body.status !== 'success' || !body.reference || !Number.isSafeInteger(body.amount_kobo)) return json({ ok: true, ignored: true });

  const res = await completeFunding(body.reference, body.amount_kobo as number);
  if (!res.ok) console.error('funding rejected', body.reference, res.reason);
  return json({ ok: true });
}
