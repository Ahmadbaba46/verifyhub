import crypto from 'node:crypto';
import { query } from './db';

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  env: 'live' | 'test';
  services: string[];
  allowed_ips: string[];
  daily_cap_kobo: string | null;
  rpm_limit: number | null;
  status: 'active' | 'revoked';
  grace_until: Date | null;
  display: string;
};

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** A new secret: vh_live_<32 hex>. We keep only the hash and a safe-to-show display string. */
export function generateKey(env: 'live' | 'test') {
  const body = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  const secret = `vh_${env}_${body}`;
  return { secret, hash: sha256(secret), display: `vh_${env}_${body.slice(0, 4)}…${body.slice(-4)}` };
}

export const hashKey = (secret: string) => sha256(secret);

/** Reads the bearer token from the Authorization header. */
export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

/**
 * Finds the active key for a presented secret. A key that was rotated still works until its grace time.
 * Returns null for an unknown, revoked or expired-grace key — the caller answers 401 without saying which.
 */
export async function resolveKey(secret: string): Promise<ApiKeyRow | null> {
  if (!/^vh_(live|test)_[0-9a-f]{32}$/.test(secret)) return null;
  const { rows } = await query<ApiKeyRow & { grace_until: Date | null }>(
    `SELECT id, user_id, name, env, services, allowed_ips, daily_cap_kobo, rpm_limit, status, grace_until, display
     FROM api_keys WHERE hash = $1`,
    [hashKey(secret)],
  );
  const k = rows[0];
  if (!k) return null;
  if (k.status === 'revoked') return null;
  if (k.grace_until && new Date(k.grace_until) < new Date()) return null;
  return k;
}

/** The caller's IP, from the proxy header first. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function touchKey(id: string) {
  await query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [id]);
}
