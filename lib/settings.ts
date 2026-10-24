import { query } from './db';
import type { Tx } from './db';

export type Settings = {
  min_topup_kobo: number;
  retention_hours: number;
  auto_refund: boolean;
  referral: { enabled: boolean; reward_kobo: number; min_first_topup_kobo: number; max_rewards: number };
  bonus_tiers: { enabled: boolean; tiers: { min_kobo: number; percent: number }[] };
  taxpayer_types: string[];
  api: { rpm_limit: number; max_keys: number; daily_cap_kobo: number | null; require_ip_allowlist: boolean; allow_test: boolean; idempotency_hours: number };
};

const DEFAULTS: Settings = {
  min_topup_kobo: 50000,
  retention_hours: 24,
  auto_refund: true,
  referral: { enabled: true, reward_kobo: 20000, min_first_topup_kobo: 100000, max_rewards: 20 },
  bonus_tiers: { enabled: true, tiers: [] },
  taxpayer_types: ['Individual'],
  api: { rpm_limit: 60, max_keys: 5, daily_cap_kobo: null, require_ip_allowlist: true, allow_test: true, idempotency_hours: 24 },
};

export async function getSettings(tx?: Tx): Promise<Settings> {
  const run = tx ? tx.query.bind(tx) : query;
  const { rows } = await run('SELECT key, value FROM settings');
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function setSetting(key: keyof Settings, value: unknown) {
  await query(
    'INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, JSON.stringify(value)],
  );
}
