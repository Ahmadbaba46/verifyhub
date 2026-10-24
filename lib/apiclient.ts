import { query } from './db';
import { getSettings } from './settings';
import { ClientRow } from './apirun';

export const SERVICES = ['nin', 'match', 'tin'] as const;

export async function getClient(userId: string): Promise<ClientRow | null> {
  const { rows } = await query<ClientRow>('SELECT user_id, status, rpm_limit, daily_cap_kobo FROM api_clients WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

/** Full client row with the fields the admin edits. */
export async function getClientFull(userId: string) {
  const { rows } = await query(
    `SELECT c.*, u.name, u.email, w.balance_kobo
     FROM api_clients c JOIN users u ON u.id = c.user_id JOIN wallets w ON w.user_id = c.user_id WHERE c.user_id = $1`,
    [userId],
  );
  return rows[0];
}

/** Creates a pending access request if the user has no client row yet. Returns the row's status. */
export async function requestAccess(userId: string): Promise<string> {
  const settings = (await getSettings()).api;
  const { rows } = await query(
    `INSERT INTO api_clients (user_id, rpm_limit, max_keys, daily_cap_kobo, require_ip_allowlist, allow_test)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING status`,
    [userId, settings.rpm_limit, settings.max_keys, settings.daily_cap_kobo, settings.require_ip_allowlist, settings.allow_test],
  );
  if (rows.length) return rows[0].status;
  const existing = await getClient(userId);
  return existing?.status ?? 'pending';
}

/** Which services are currently open to the API, for building key permission choices. */
export async function apiServices(): Promise<{ key: string; label: string }[]> {
  const { rows } = await query(`SELECT key, label FROM services WHERE enabled AND api_enabled ORDER BY sort, key`);
  return rows;
}
