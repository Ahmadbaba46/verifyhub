import { json, sameOrigin } from '@/lib/api';
import { endSession } from '@/lib/auth';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
  await endSession();
  return json({ ok: true });
}
