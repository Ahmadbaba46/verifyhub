import type { Tx } from './db';

export class InsufficientFunds extends Error {
  constructor(public needKobo: number, public haveKobo: number) {
    super('Insufficient wallet balance');
  }
}

export type EntryKind = 'topup' | 'bonus' | 'charge' | 'refund' | 'referral' | 'adjustment';

export type LedgerEntry = {
  id: string;
  user_id: string;
  kind: EntryKind;
  amount_kobo: string; // bigint comes back as a string
  balance_after_kobo: string;
  reference: string;
  idempotency_key: string;
  meta: Record<string, unknown>;
  created_at: Date;
};

type Apply = {
  userId: string;
  /** Signed: positive credits the wallet, negative charges it. */
  amountKobo: number;
  kind: EntryKind;
  reference: string;
  /** Same key => same entry. A retried request or duplicate webhook can never apply twice. */
  key: string;
  meta?: Record<string, unknown>;
};

/**
 * The only function that changes a balance. Must run inside a transaction.
 * Locks the wallet row first, so concurrent requests for one user are serialised.
 */
export async function applyEntry(tx: Tx, a: Apply): Promise<{ entry: LedgerEntry; replay: boolean }> {
  if (!Number.isSafeInteger(a.amountKobo)) throw new Error('amount must be an integer number of kobo');

  const w = await tx.query('SELECT balance_kobo FROM wallets WHERE user_id = $1 FOR UPDATE', [a.userId]);
  if (!w.rowCount) throw new Error('wallet not found');

  const prior = await tx.query<LedgerEntry>('SELECT * FROM ledger_entries WHERE idempotency_key = $1', [a.key]);
  if (prior.rowCount) return { entry: prior.rows[0], replay: true };

  const balance = Number(w.rows[0].balance_kobo);
  const next = balance + a.amountKobo;
  if (next < 0) throw new InsufficientFunds(-a.amountKobo, balance);

  const funded = a.kind === 'topup' ? a.amountKobo : 0;
  await tx.query(
    `UPDATE wallets SET balance_kobo = $2, total_funded_kobo = total_funded_kobo + $3, updated_at = now() WHERE user_id = $1`,
    [a.userId, next, funded],
  );
  const ins = await tx.query<LedgerEntry>(
    `INSERT INTO ledger_entries (user_id, kind, amount_kobo, balance_after_kobo, reference, idempotency_key, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [a.userId, a.kind, a.amountKobo, next, a.reference, a.key, JSON.stringify(a.meta ?? {})],
  );

  if (funded) await updateTier(tx, a.userId);
  return { entry: ins.rows[0], replay: false };
}

const TIERS = [
  { name: 'gold', minKobo: 10_000_000 }, // ₦100,000 funded in total
  { name: 'silver', minKobo: 2_000_000 }, // ₦20,000
];

async function updateTier(tx: Tx, userId: string) {
  const { rows } = await tx.query('SELECT total_funded_kobo FROM wallets WHERE user_id = $1', [userId]);
  const total = Number(rows[0].total_funded_kobo);
  const tier = TIERS.find((t) => total >= t.minKobo)?.name ?? 'bronze';
  await tx.query('UPDATE users SET tier = $2 WHERE id = $1 AND tier <> $2', [userId, tier]);
}

export const credit = (tx: Tx, a: Omit<Apply, 'amountKobo'> & { amountKobo: number }) => {
  if (a.amountKobo <= 0) throw new Error('credit must be positive');
  return applyEntry(tx, a);
};

export const charge = (tx: Tx, a: Omit<Apply, 'amountKobo' | 'kind'> & { amountKobo: number }) => {
  if (a.amountKobo < 0) throw new Error('charge must not be negative');
  return applyEntry(tx, { ...a, amountKobo: -a.amountKobo, kind: 'charge' });
};

/** Returns a charge to the wallet. Refunding the same charge twice is a no-op. */
export async function refundCharge(tx: Tx, chargeEntryId: string, reason: string) {
  const { rows } = await tx.query<LedgerEntry>('SELECT * FROM ledger_entries WHERE id = $1', [chargeEntryId]);
  const original = rows[0];
  if (!original || original.kind !== 'charge') throw new Error('not a charge entry');
  return applyEntry(tx, {
    userId: original.user_id,
    amountKobo: -Number(original.amount_kobo),
    kind: 'refund',
    reference: original.reference,
    key: `refund:${original.id}`,
    meta: { reason, refundOf: original.id },
  });
}
