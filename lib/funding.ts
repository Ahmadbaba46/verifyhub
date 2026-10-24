import { randomCode } from './crypto';
import { query, withTx } from './db';
import { credit } from './ledger';
import { getSettings } from './settings';

export async function createFundingRequest(userId: string, amountKobo: number) {
  const s = await getSettings();
  if (amountKobo < s.min_topup_kobo) throw new Error('Amount is below the minimum top-up');
  const ref = randomCode('FUND', 6);
  await query('INSERT INTO funding_requests (user_id, amount_kobo, provider_ref) VALUES ($1, $2, $3)', [userId, amountKobo, ref]);
  return { reference: ref };
}

export function bonusFor(amountKobo: number, tiers: { min_kobo: number; percent: number }[]) {
  const hit = [...tiers].sort((a, b) => b.min_kobo - a.min_kobo).find((t) => amountKobo >= t.min_kobo);
  return hit ? Math.floor((amountKobo * hit.percent) / 100) : 0;
}

/**
 * Marks a funding request paid and credits the wallet, bonus and any referral reward.
 * Safe to call many times for one reference (duplicate webhooks): everything is keyed.
 */
export async function completeFunding(providerRef: string, paidKobo: number) {
  return withTx(async (tx) => {
    const fr = await tx.query('SELECT * FROM funding_requests WHERE provider_ref = $1 FOR UPDATE', [providerRef]);
    if (!fr.rowCount) return { ok: false as const, reason: 'unknown reference' };
    const req = fr.rows[0];
    if (req.status === 'paid') return { ok: true as const, duplicate: true };
    if (Number(req.amount_kobo) !== paidKobo) {
      await tx.query(`UPDATE funding_requests SET status = 'failed' WHERE id = $1`, [req.id]);
      return { ok: false as const, reason: 'amount mismatch' };
    }

    const s = await getSettings(tx);
    await credit(tx, {
      userId: req.user_id,
      amountKobo: paidKobo,
      kind: 'topup',
      reference: providerRef,
      key: `fund:${providerRef}`,
    });

    // Bonus: a per-client API agreement overrides the global tiers when present.
    let bonus = s.bonus_tiers.enabled ? bonusFor(paidKobo, s.bonus_tiers.tiers) : 0;
    const cb = (await tx.query(`SELECT bonus FROM api_clients WHERE user_id = $1 AND status = 'approved'`, [req.user_id])).rows[0]?.bonus;
    if (cb && cb.type === 'topup_percent' && paidKobo >= (cb.min_kobo ?? 0)) {
      bonus = Math.floor((paidKobo * (cb.percent ?? 0)) / 100);
      if (cb.max_kobo) bonus = Math.min(bonus, cb.max_kobo);
    }
    if (bonus > 0) {
      await credit(tx, { userId: req.user_id, amountKobo: bonus, kind: 'bonus', reference: providerRef, key: `bonus:${providerRef}` });
    }

    // Referral reward: only on the friend's first paid top-up that meets the minimum.
    const user = (await tx.query('SELECT referred_by FROM users WHERE id = $1', [req.user_id])).rows[0];
    if (s.referral.enabled && user.referred_by && paidKobo >= s.referral.min_first_topup_kobo) {
      const priorPaid = await tx.query(`SELECT 1 FROM funding_requests WHERE user_id = $1 AND status = 'paid' LIMIT 1`, [req.user_id]);
      if (!priorPaid.rowCount) {
        const rewarded = await tx.query(
          `SELECT count(*)::int AS n FROM ledger_entries WHERE user_id = $1 AND kind = 'referral'`,
          [user.referred_by],
        );
        if (rewarded.rows[0].n < s.referral.max_rewards) {
          await credit(tx, { userId: user.referred_by, amountKobo: s.referral.reward_kobo, kind: 'referral', reference: providerRef, key: `ref:${req.id}:referrer` });
        }
        await credit(tx, { userId: req.user_id, amountKobo: s.referral.reward_kobo, kind: 'referral', reference: providerRef, key: `ref:${req.id}:friend` });
      }
    }

    await tx.query(`UPDATE funding_requests SET status = 'paid', paid_at = now() WHERE id = $1`, [req.id]);
    return { ok: true as const, duplicate: false };
  });
}
