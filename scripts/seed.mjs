// Creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD. Safe to re-run.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD are required');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 10) {
  console.error('ADMIN_PASSWORD must be at least 10 characters');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: /railway|neon|supabase/.test(DATABASE_URL) && !/\.internal/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const existing = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL.toLowerCase()]);
if (existing.rowCount) {
  await client.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [existing.rows[0].id]);
  console.log('admin already exists, role confirmed');
} else {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const code = 'ADMIN-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const { rows } = await client.query(
    `INSERT INTO users (name, email, password_hash, role, referral_code) VALUES ('Admin', $1, $2, 'admin', $3) RETURNING id`,
    [ADMIN_EMAIL.toLowerCase(), hash, code],
  );
  await client.query('INSERT INTO wallets (user_id) VALUES ($1)', [rows[0].id]);
  console.log('admin created:', ADMIN_EMAIL);
}
await client.end();
