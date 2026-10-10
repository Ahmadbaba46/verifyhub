import pg from 'pg';

const url = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined;
}

function makePool() {
  if (!url) throw new Error('DATABASE_URL is not set');
  const external = /railway|neon|supabase/.test(url) && !/\.internal/.test(url);
  return new pg.Pool({
    connectionString: url,
    max: 10,
    ssl: external ? { rejectUnauthorized: false } : undefined,
  });
}

export function pool(): pg.Pool {
  if (!globalThis.__pgPool) globalThis.__pgPool = makePool();
  return globalThis.__pgPool;
}

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool().query<T>(text, params);
}

/** Runs fn inside one transaction. Rolls back if fn throws. */
export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export type Tx = pg.PoolClient;
