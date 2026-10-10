import { z } from 'zod';
import { errorResponse, json, sameOrigin } from '@/lib/api';
import { hashPassword, rateLimit, startSession } from '@/lib/auth';
import { randomCode } from '@/lib/crypto';
import { withTx } from '@/lib/db';

const Body = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(20).optional().default(''),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  referral: z.string().trim().max(30).optional().default(''),
});

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
    if (!rateLimit(`reg:${ip}`, 10, 60 * 60_000)) return json({ error: 'Too many attempts. Try again later.' }, 429);

    const b = Body.parse(await req.json());
    const hash = await hashPassword(b.password);

    const userId = await withTx(async (tx) => {
      const dup = await tx.query('SELECT 1 FROM users WHERE email = $1', [b.email]);
      if (dup.rowCount) throw Object.assign(new Error('exists'), { code: 'EXISTS' });

      let referredBy: string | null = null;
      if (b.referral) {
        const r = await tx.query('SELECT id FROM users WHERE referral_code = $1', [b.referral.toUpperCase()]);
        referredBy = r.rows[0]?.id ?? null; // an unknown code is ignored, never blocks sign-up
      }
      const { rows } = await tx.query(
        `INSERT INTO users (name, email, phone, password_hash, referral_code, referred_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [b.name, b.email, b.phone, hash, randomCode(b.name.split(' ')[0].replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'USER', 2), referredBy],
      );
      await tx.query('INSERT INTO wallets (user_id) VALUES ($1)', [rows[0].id]);
      return rows[0].id as string;
    });

    await startSession(userId);
    return json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'EXISTS') return json({ error: 'An account with this email already exists. Log in instead.' }, 409);
    return errorResponse(err);
  }
}
