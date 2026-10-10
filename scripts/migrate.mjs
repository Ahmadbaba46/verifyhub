// Applies db/migrations/*.sql in order, once each. Safe to run on every deploy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /railway|neon|supabase/.test(url) && !/\.internal/.test(url) ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
// Prevent two deploys from migrating at once.
await client.query('SELECT pg_advisory_lock(727274)');

const done = new Set((await client.query('SELECT name FROM _migrations')).rows.map((r) => r.name));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  if (done.has(file)) continue;
  console.log('applying', file);
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('migration failed:', file, err.message);
    process.exit(1);
  }
}
await client.query('SELECT pg_advisory_unlock(727274)');
await client.end();
console.log('migrations up to date');
