import crypto from 'node:crypto';
import type { ApiKeyRow } from './apikeys';
import { encryptJson } from './crypto';
import { query, withTx } from './db';
import { charge, InsufficientFunds, refundCharge } from './ledger';
import { assertAvailable, ExecOutcome, getPrice, getService, ServiceUnavailable } from './run';
import { getSettings } from './settings';

/** service key -> the list price key it falls back to when the client has no agreed price. */
const LIST_PRICE_KEY: Record<string, string> = { nin: 'nin_validate', match: 'match_check', tin: 'tin_lookup' };

export type ClientRow = {
  user_id: string;
  status: 'pending' | 'approved' | 'suspended';
  rpm_limit: number;
  daily_cap_kobo: string | null;
};

/** The price this client pays for a service: their agreed price, else the public list price. */
export async function priceForClient(userId: string, serviceKey: string): Promise<number> {
  const { rows } = await query('SELECT amount_kobo FROM api_prices WHERE user_id = $1 AND service_key = $2', [userId, serviceKey]);
  if (rows.length) return Number(rows[0].amount_kobo);
  return getPrice(LIST_PRICE_KEY[serviceKey]);
}

export type ApiResult = { status: number; body: Record<string, unknown> };

type Args<T> = {
  key: ApiKeyRow;
  client: ClientRow;
  serviceKey: string;
  endpoint: string;
  idempotencyKey: string | null;
  ip: string;
  /** Formats the found result into the JSON `data` the client receives. */
  exec: () => Promise<ExecOutcome<T>>;
  shape: (data: T) => Record<string, unknown>;
};

const reqId = () => 'req_' + crypto.randomBytes(6).toString('hex');

async function logRequest(a: {
  requestId: string; userId: string; keyId: string | null; serviceKey: string | null; endpoint: string;
  idempotencyKey: string | null; status: number; outcome: string; chargedKobo: number; chargeEntryId: string | null;
  durationMs: number; ip: string; body: Record<string, unknown>; store: boolean; idemHours: number;
}) {
  const expires = a.store && a.idempotencyKey ? new Date(Date.now() + a.idemHours * 3600_000) : null;
  const enc = a.store && a.idempotencyKey ? encryptJson({ status: a.status, body: a.body }) : null;
  try {
    await query(
      `INSERT INTO api_requests (request_id, user_id, key_id, service_key, endpoint, idempotency_key, status_code, outcome,
         charged_kobo, charge_entry_id, duration_ms, ip, response_enc, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [a.requestId, a.userId, a.keyId, a.serviceKey, a.endpoint, a.idempotencyKey, a.status, a.outcome,
       a.chargedKobo, a.chargeEntryId, a.durationMs, a.ip, enc, expires],
    );
  } catch (err: any) {
    // A concurrent request with the same idempotency key won the unique index. The charge was keyed on the
    // idempotency key too, so no money moved twice; surface the stored answer below.
    if (err?.code !== '23505') throw err;
  }
}

/** Returns a stored response for a repeated idempotency key, if one is still within its window. */
async function replay(userId: string, idem: string): Promise<ApiResult | null> {
  const { rows } = await query(
    `SELECT response_enc, expires_at FROM api_requests
     WHERE user_id = $1 AND idempotency_key = $2 AND response_enc IS NOT NULL AND (expires_at IS NULL OR expires_at > now())`,
    [userId, idem],
  );
  if (!rows.length) return null;
  const { decryptJson } = await import('./crypto');
  const saved = decryptJson<{ status: number; body: Record<string, unknown> }>(rows[0].response_enc);
  return { status: saved.status, body: { ...saved.body, replayed: true } };
}

/**
 * One metered API call. Mirrors the website's charge-first rule: take the money, call the provider, and
 * refund automatically if nothing is found or the provider fails — so the client pays only for a result.
 */
export async function runApiCheck<T>(a: Args<T>): Promise<ApiResult> {
  const started = Date.now();
  const settings = await getSettings();
  const requestId = reqId();
  const common = {
    requestId, userId: a.key.user_id, keyId: a.key.id, serviceKey: a.serviceKey, endpoint: a.endpoint,
    idempotencyKey: a.idempotencyKey, ip: a.ip, idemHours: settings.api.idempotency_hours,
  };
  const done = (status: number, outcome: string, body: Record<string, unknown>, extra: { chargedKobo?: number; chargeEntryId?: string | null; store?: boolean } = {}) => {
    const full = { request_id: requestId, ...body };
    void logRequest({ ...common, status, outcome, chargedKobo: extra.chargedKobo ?? 0, chargeEntryId: extra.chargeEntryId ?? null, durationMs: Date.now() - started, body: full, store: extra.store ?? false });
    return { status, body: full };
  };

  // Idempotent replay: hand back the first answer, charge nothing again.
  if (a.idempotencyKey) {
    const prior = await replay(a.key.user_id, a.idempotencyKey);
    if (prior) return prior;
  }

  // The key must be allowed to call this service, and the service must be on for the API.
  if (!a.key.services.includes(a.serviceKey)) {
    return done(403, 'forbidden', { error: { code: 'forbidden', message: 'This key may not call this service.' } });
  }
  try {
    assertAvailable(await getService(a.serviceKey), 'api');
  } catch (e) {
    if (e instanceof ServiceUnavailable) return done(503, 'unavailable', { error: { code: 'unavailable', message: e.message } });
    throw e;
  }

  // Rate limit, then daily spend cap, both per key.
  const rpm = a.key.rpm_limit ?? a.client.rpm_limit;
  const { rows: rc } = await query(`SELECT count(*)::int AS n FROM api_requests WHERE key_id = $1 AND created_at > now() - interval '60 seconds'`, [a.key.id]);
  if (rc[0].n >= rpm) return done(429, 'rate_limited', { error: { code: 'rate_limited', message: `Rate limit is ${rpm} requests per minute.` } });

  const cap = a.key.daily_cap_kobo != null ? Number(a.key.daily_cap_kobo) : a.client.daily_cap_kobo != null ? Number(a.client.daily_cap_kobo) : null;
  if (cap != null) {
    const { rows: sc } = await query(`SELECT COALESCE(sum(charged_kobo),0)::bigint AS spent FROM api_requests WHERE key_id = $1 AND created_at::date = (now() AT TIME ZONE 'UTC')::date`, [a.key.id]);
    if (Number(sc[0].spent) >= cap) return done(429, 'rate_limited', { error: { code: 'daily_cap_reached', message: 'This key reached its daily spend cap.' } });
  }

  const price = await priceForClient(a.key.user_id, a.serviceKey);
  // Key the charge on the idempotency key when present, so even a racing retry cannot charge twice.
  const chargeKey = a.idempotencyKey ? `api:idem:${a.key.user_id}:${a.idempotencyKey}` : `api:${requestId}`;

  let chargeEntryId: string;
  try {
    const entry = await withTx((tx) =>
      charge(tx, { userId: a.key.user_id, amountKobo: price, reference: requestId, key: chargeKey, meta: { api: true, service: a.serviceKey, keyId: a.key.id } }),
    );
    chargeEntryId = entry.entry.id;
  } catch (e) {
    if (e instanceof InsufficientFunds) {
      return done(402, 'insufficient', { charged: 0, error: { code: 'insufficient_funds', message: 'Wallet balance is too low for this request.' } }, { store: true });
    }
    throw e;
  }

  const refund = (reason: string) => withTx((tx) => refundCharge(tx, chargeEntryId, reason));

  try {
    const out = await a.exec();
    if (!out.found) {
      await refund(out.reason ?? 'not found');
      return done(404, 'not_found', { charged: 0, error: { code: 'not_found', message: out.reason ?? 'No record matches this request.' } }, { store: true });
    }
    return done(200, 'ok', { charged: price, data: a.shape(out.data) }, { chargedKobo: price, chargeEntryId, store: true });
  } catch (err) {
    await refund(err instanceof Error ? err.message : 'provider error');
    return done(502, 'provider_error', { charged: 0, error: { code: 'provider_error', message: 'The upstream service failed. You were not charged.' } }, { store: true });
  }
}
