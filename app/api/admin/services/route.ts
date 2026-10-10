import { z } from 'zod';
import { authed, json } from '@/lib/api';
import { withTx } from '@/lib/db';
import { parseNairaToKobo } from '@/lib/money';

const Body = z.object({
  services: z.array(
    z.object({
      key: z.string(),
      enabled: z.boolean(),
      web_enabled: z.boolean(),
      telegram_enabled: z.boolean(),
      paused_message: z.string().trim().min(5).max(300),
    }),
  ),
  prices: z.array(z.object({ key: z.string(), amount: z.union([z.string(), z.number()]) })),
  settings: z
    .object({
      min_topup: z.union([z.string(), z.number()]).optional(),
      retention_hours: z.number().int().min(1).max(720).optional(),
      auto_refund: z.boolean().optional(),
    })
    .optional(),
});

export const PUT = authed(
  async (req, admin) => {
    const b = Body.parse(await req.json());
    const priceUpdates: [string, number][] = [];
    for (const p of b.prices) {
      const kobo = parseNairaToKobo(p.amount);
      if (kobo === null) return json({ error: `Invalid price for ${p.key}` }, 400);
      priceUpdates.push([p.key, kobo]);
    }

    await withTx(async (tx) => {
      for (const s of b.services) {
        await tx.query(
          `UPDATE services SET enabled = $2, web_enabled = $3, telegram_enabled = $4, paused_message = $5 WHERE key = $1`,
          [s.key, s.enabled, s.web_enabled, s.telegram_enabled, s.paused_message],
        );
      }
      for (const [key, kobo] of priceUpdates) {
        await tx.query(`UPDATE prices SET amount_kobo = $2, updated_at = now() WHERE key = $1 AND amount_kobo <> $2`, [key, kobo]);
      }
      const set = async (key: string, value: unknown) =>
        tx.query(`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, JSON.stringify(value)]);
      if (b.settings?.min_topup !== undefined) {
        const k = parseNairaToKobo(b.settings.min_topup);
        if (k === null || k < 100) throw new Error('Invalid minimum top-up');
        await set('min_topup_kobo', k);
      }
      if (b.settings?.retention_hours !== undefined) await set('retention_hours', b.settings.retention_hours);
      if (b.settings?.auto_refund !== undefined) await set('auto_refund', b.settings.auto_refund);
      await tx.query(`INSERT INTO audit_log (actor_id, action, detail) VALUES ($1, 'services.update', $2)`, [admin.id, JSON.stringify(b)]);
    });
    return json({ ok: true });
  },
  { admin: true },
);
