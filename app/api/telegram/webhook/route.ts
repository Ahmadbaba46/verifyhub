import crypto from 'node:crypto';
import { json } from '@/lib/api';
import { query } from '@/lib/db';
import { handleMessage } from '@/lib/telegram';

/**
 * Register once with Telegram:
 *   curl "https://api.telegram.org/bot$TOKEN/setWebhook" -d url=$APP_URL/api/telegram/webhook -d secret_token=$TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || got.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return json({ error: 'forbidden' }, 403);
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (!update?.update_id || !msg?.chat?.id || typeof msg.text !== 'string') return json({ ok: true });

  // Telegram redelivers on timeouts. Handle each update exactly once.
  const seen = await query('INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING 1', [update.update_id]);
  if (!seen.rowCount) return json({ ok: true, duplicate: true });

  // Private chats only, so one person's balance is never driven from a group.
  if (msg.chat.type !== 'private') return json({ ok: true });

  try {
    await handleMessage(Number(msg.chat.id), msg.text);
  } catch (err) {
    console.error('telegram handler error', err);
  }
  return json({ ok: true });
}
