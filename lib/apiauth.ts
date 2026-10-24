import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ApiKeyRow, bearer, clientIp, resolveKey, touchKey } from './apikeys';
import { ClientRow } from './apirun';
import { query } from './db';

const apiJson = (body: Record<string, unknown>, status: number, requestId?: string) =>
  NextResponse.json(requestId ? { request_id: requestId, ...body } : body, { status });

async function logDenied(userId: string, keyId: string, endpoint: string, ip: string, status: number, outcome: string) {
  try {
    await query(
      `INSERT INTO api_requests (request_id, user_id, key_id, endpoint, status_code, outcome, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      ['req_' + crypto.randomBytes(6).toString('hex'), userId, keyId, endpoint, status, outcome, ip],
    );
  } catch {
    /* logging must never break the response */
  }
}

export type Authed = { key: ApiKeyRow; client: ClientRow; ip: string };

/** Logs a 422 for malformed input (before any charge) and returns the response. */
export async function rejectInvalid(ctx: Authed, endpoint: string, serviceKey: string, message: string): Promise<NextResponse> {
  const requestId = 'req_' + crypto.randomBytes(6).toString('hex');
  try {
    await query(
      `INSERT INTO api_requests (request_id, user_id, key_id, service_key, endpoint, status_code, outcome, ip)
       VALUES ($1,$2,$3,$4,$5,422,'invalid',$6)`,
      [requestId, ctx.key.user_id, ctx.key.id, serviceKey, endpoint, ctx.ip],
    );
  } catch {
    /* ignore */
  }
  return apiJson({ error: { code: 'invalid_input', message } }, 422, requestId);
}

/**
 * Authenticates a /v1 request by its API key. On failure it returns a ready Response (and logs the
 * attempt once the key is known). A bad or unknown key gets a flat 401 that does not say why.
 */
export async function authenticate(req: Request, endpoint: string): Promise<{ ok: true; ctx: Authed } | { ok: false; res: NextResponse }> {
  const secret = bearer(req);
  if (!secret) return { ok: false, res: apiJson({ error: { code: 'invalid_key', message: 'Provide your API key as a Bearer token.' } }, 401) };

  const key = await resolveKey(secret);
  if (!key) return { ok: false, res: apiJson({ error: { code: 'invalid_key', message: 'This API key is missing, wrong or revoked.' } }, 401) };

  const ip = clientIp(req);
  const { rows } = await query<ClientRow>('SELECT user_id, status, rpm_limit, daily_cap_kobo FROM api_clients WHERE user_id = $1', [key.user_id]);
  const client = rows[0];
  if (!client || client.status !== 'approved') {
    await logDenied(key.user_id, key.id, endpoint, ip, 403, 'forbidden');
    return { ok: false, res: apiJson({ error: { code: 'access_disabled', message: 'API access is not enabled for this account.' } }, 403) };
  }

  if (key.allowed_ips.length && !key.allowed_ips.includes(ip)) {
    await logDenied(key.user_id, key.id, endpoint, ip, 403, 'ip_blocked');
    return { ok: false, res: apiJson({ error: { code: 'ip_not_allowed', message: 'This request came from an address not on the key’s allowlist.' } }, 403) };
  }

  void touchKey(key.id);
  return { ok: true, ctx: { key, client, ip } };
}

export { apiJson };
