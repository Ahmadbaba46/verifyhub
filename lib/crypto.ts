import crypto from 'node:crypto';

function key(): Buffer {
  const hex = process.env.RESULT_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('RESULT_ENCRYPTION_KEY must be 64 hex characters');
  return Buffer.from(hex, 'hex');
}

/** AES-256-GCM. Output: iv.tag.ciphertext, all base64. */
export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}

export function decryptJson<T = unknown>(blob: string): T {
  const [iv, tag, ct] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')) as T;
}

export function randomCode(prefix: string, bytes = 3): string {
  return `${prefix}-${crypto.randomBytes(bytes).toString('hex').toUpperCase()}`;
}

export function maskTail(value: string, keep = 4): string {
  const v = value.replace(/\s+/g, '');
  return '•'.repeat(Math.max(v.length - keep, 0)) + v.slice(-keep);
}
