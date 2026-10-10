import { z } from 'zod';
import { errorResponse, json, sameOrigin } from '@/lib/api';
import { hashPassword, rateLimit, startSession, verifyPassword } from '@/lib/auth';
import { query } from '@/lib/db';

const Body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// Compared when the email is unknown so response timing does not reveal which emails exist.
let dummyHash: Promise<string> | undefined;
const getDummy = () => (dummyHash ??= hashPassword('not-a-real-password'));

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
    const b = Body.parse(await req.json());
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
    if (!rateLimit(`login:${ip}:${b.email}`, 8, 15 * 60_000)) return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);

    const { rows } = await query('SELECT id, password_hash, status FROM users WHERE email = $1', [b.email]);
    const u = rows[0];
    const ok = await verifyPassword(b.password, u?.password_hash ?? (await getDummy()));
    if (!u || !ok) return json({ error: 'Wrong email or password' }, 401);
    if (u.status !== 'active') return json({ error: 'This account is suspended. Contact support.' }, 403);

    await startSession(u.id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
