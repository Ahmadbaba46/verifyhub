import crypto from 'node:crypto';
import { decryptJson, encryptJson } from './crypto';
import { query, withTx } from './db';
import { charge, InsufficientFunds, refundCharge } from './ledger';
import { getSettings } from './settings';

export class ServiceUnavailable extends Error {}
export { InsufficientFunds };

export type Channel = 'web' | 'telegram';

export async function getService(key: string) {
  const { rows } = await query('SELECT * FROM services WHERE key = $1', [key]);
  return rows[0] as
    | { key: string; label: string; enabled: boolean; web_enabled: boolean; telegram_enabled: boolean; paused_message: string }
    | undefined;
}

export async function getPrice(key: string): Promise<number> {
  const { rows } = await query('SELECT amount_kobo FROM prices WHERE key = $1', [key]);
  if (!rows.length) throw new Error(`unknown price ${key}`);
  return Number(rows[0].amount_kobo);
}

export function assertAvailable(svc: Awaited<ReturnType<typeof getService>>, channel: Channel) {
  if (!svc) throw new ServiceUnavailable('Unknown service');
  const on = svc.enabled && (channel === 'web' ? svc.web_enabled : svc.telegram_enabled);
  if (!on) throw new ServiceUnavailable(svc.paused_message);
}

export type ExecOutcome<T> = { found: true; data: T } | { found: false; reason?: string };

/**
 * Charge-first pattern:
 *  1. In one transaction: create the check row and take the money. If the wallet is short, nothing is written.
 *  2. Call the provider (slow, outside the transaction).
 *  3. Found -> store the encrypted result. Not found or provider failure -> refund automatically.
 */
export async function runPaidCheck<T>(args: {
  userId: string;
  serviceKey: string;
  priceKey: string;
  channel: Channel;
  inputHint: string;
  exec: () => Promise<ExecOutcome<T>>;
}): Promise<{ checkId: string; reference: string; status: 'completed' | 'refunded'; data?: T; notFound?: boolean; error?: string; chargedKobo: number }> {
  const svc = await getService(args.serviceKey);
  assertAvailable(svc, args.channel);
  const price = await getPrice(args.priceKey);
  const settings = await getSettings();

  const reference = 'VH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const checkId = crypto.randomUUID();

  const chargeEntry = await withTx(async (tx) => {
    const entry = await charge(tx, {
      userId: args.userId,
      amountKobo: price,
      reference,
      key: `charge:${checkId}`,
      meta: { service: args.serviceKey, price: args.priceKey },
    });
    await tx.query(
      `INSERT INTO checks (id, user_id, service_key, channel, reference, input_hint, charge_entry_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [checkId, args.userId, args.serviceKey, args.channel, reference, args.inputHint, entry.entry.id],
    );
    return entry.entry;
  });

  const refund = async (status: 'refunded' | 'failed', error: string) => {
    await withTx(async (tx) => {
      if (settings.auto_refund) await refundCharge(tx, chargeEntry.id, error);
      await tx.query(`UPDATE checks SET status = $2, error = $3, completed_at = now() WHERE id = $1`, [
        checkId,
        settings.auto_refund ? 'refunded' : status,
        error,
      ]);
    });
  };

  try {
    const out = await args.exec();
    if (!out.found) {
      await refund('refunded', out.reason ?? 'Not found');
      return { checkId, reference, status: 'refunded', notFound: true, chargedKobo: 0 };
    }
    const expires = new Date(Date.now() + settings.retention_hours * 3600_000);
    await query(
      `UPDATE checks SET status = 'completed', result_enc = $2, expires_at = $3, completed_at = now() WHERE id = $1`,
      [checkId, encryptJson(out.data), expires],
    );
    return { checkId, reference, status: 'completed', data: out.data, chargedKobo: price };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provider error';
    console.error('check failed', { checkId, message });
    await refund('failed', message);
    return { checkId, reference, status: 'refunded', error: 'The provider could not complete this check. Your wallet was not charged.', chargedKobo: 0 };
  }
}

/** Loads a stored, unexpired result belonging to this user. */
export async function loadCheck<T = unknown>(userId: string, checkId: string) {
  const { rows } = await query(
    `SELECT * FROM checks WHERE id = $1 AND user_id = $2`,
    [checkId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const expired = row.expires_at && new Date(row.expires_at) < new Date();
  const data = row.result_enc && !expired ? decryptJson<T>(row.result_enc) : null;
  return { row, data, expired: Boolean(expired) };
}

/**
 * Pay for a document (slip/certificate) attached to a completed check. Charged once per check:
 * downloading it again is free.
 */
export async function buyDocument(args: { userId: string; checkId: string; priceKey: string; docKey: string }) {
  const price = await getPrice(args.priceKey);
  await withTx(async (tx) => {
    await charge(tx, {
      userId: args.userId,
      amountKobo: price,
      reference: `DOC-${args.checkId.slice(0, 8).toUpperCase()}`,
      key: `${args.docKey}:${args.checkId}`,
      meta: { document: args.docKey, check: args.checkId },
    });
  });
}
