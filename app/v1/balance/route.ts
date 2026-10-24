import { apiJson, authenticate } from '@/lib/apiauth';
import { query } from '@/lib/db';

const ENDPOINT = 'GET /v1/balance';

export async function GET(req: Request) {
  const auth = await authenticate(req, ENDPOINT);
  if (!auth.ok) return auth.res;
  const { rows } = await query('SELECT balance_kobo FROM wallets WHERE user_id = $1', [auth.ctx.key.user_id]);
  return apiJson({ balance_kobo: Number(rows[0]?.balance_kobo ?? 0), currency: 'NGN' }, 200);
}
