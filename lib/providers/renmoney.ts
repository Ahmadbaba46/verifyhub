import crypto from 'node:crypto';
import { BvnRecord, Lookup, ProviderError } from './types';

const URL = () => process.env.RENMONEY_BVN_URL ?? 'https://api-v3.renmoney.com/bvn/api/v3/validation';
const KEY = () => process.env.RENMONEY_AES_KEY ?? '';
const APP_ID = () => process.env.SOURCE_APP_ID ?? '';
const PAYLOAD_KEY = () => process.env.RENMONEY_PAYLOAD_KEY ?? 'bvn';

function userAgent(): string {
  return process.env.PROVIDER_USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0';
}

/** AES-128-ECB + PKCS7 encrypt, base64 output. */
function encrypt(plain: Record<string, string>): string {
  const key = KEY();
  if (!key || key.length !== 16) throw new ProviderError('RENMONEY_AES_KEY must be 16 characters', 'renmoney');
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}

/** AES-128-ECB + PKCS7 decrypt from base64. Returns null on failure. */
function decrypt(blob: string): Record<string, unknown> | null {
  const key = KEY();
  if (!key) return null;
  try {
    const raw = Buffer.from(blob.trim(), 'base64');
    const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(key, 'utf8'), null);
    decipher.setAutoPadding(true);
    const plain = Buffer.concat([decipher.update(raw), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

/**
 * Renmoney BVN lookup.
 * POST {RENMONEY_BVN_URL} with AES-128-ECB encrypted payload.
 * The response `data` field is itself AES-128-ECB encrypted.
 */
export async function renmoneyBvnLookup(bvn: string, email?: string): Promise<Lookup<BvnRecord>> {
  const cleaned = bvn.replace(/\D/g, '');
  if (cleaned.length !== 11) {
    throw new ProviderError('BVN must be eleven digits', 'renmoney');
  }

  const appId = APP_ID();
  if (!appId) throw new ProviderError('SOURCE_APP_ID is not set', 'renmoney');

  const keys = [...new Set([PAYLOAD_KEY(), 'bvn', 'b'].filter(Boolean))];
  let lastStatus = 0;
  let lastBody: Record<string, unknown> | null = null;

  for (let i = 0; i < keys.length; i++) {
    const inner: Record<string, string> = { [keys[i]]: cleaned };
    if (email) inner.email = email;

    const payload = encrypt(inner);
    const res = await fetch(URL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Origin': 'https://web.renmoney.com',
        'Referer': 'https://web.renmoney.com/',
        'SourceAppId': appId,
        'User-Agent': userAgent(),
      },
      body: JSON.stringify({
        payload,
        osVersion: 'Win32',
        deviceType: 'Chrome/138.0.0.0',
        deviceId: userAgent(),
        location: '{0,0}',
      }),
      signal: AbortSignal.timeout(30_000),
    });

    lastStatus = res.status;
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    lastBody = body;

    if (res.status >= 400 && i < keys.length - 1) continue;
    break;
  }

  if (lastStatus >= 400) {
    const upstream = lastBody?.message ?? lastBody?.responseMsg ?? lastBody?.msg ?? '';
    throw new ProviderError(
      `Renmoney returned HTTP ${lastStatus}${upstream ? ': ' + upstream : '.'}`,
      'renmoney',
    );
  }

  if (!lastBody) throw new ProviderError('The BVN provider returned nothing.', 'renmoney');

  let record: Record<string, unknown> | null = null;
  if (typeof lastBody.data === 'string') {
    record = decrypt(lastBody.data);
    if (!record) throw new ProviderError('The BVN reply could not be decrypted — check RENMONEY_AES_KEY.', 'renmoney');
  } else if (typeof lastBody.data === 'object' && lastBody.data !== null) {
    record = lastBody.data as Record<string, unknown>;
  }

  if (!record || Object.keys(record).length === 0) {
    return { found: false };
  }

  record = digRecord(record);
  if (!record) return { found: false };

  return {
    found: true,
    data: {
      bvn: pick(record, ['bvn', 'bvnnumber']) ?? cleaned,
      firstName: pick(record, ['firstname', 'first_name', 'fname']) ?? '',
      middleName: pick(record, ['middlename', 'middle_name']) ?? '',
      lastName: pick(record, ['lastname', 'last_name', 'surname']) ?? '',
      gender: pick(record, ['gender', 'sex']) ?? '',
      dateOfBirth: pick(record, ['dateofbirth', 'date_of_birth', 'dob', 'birthdate']) ?? '',
      phoneNumber: pick(record, ['phonenumber', 'phone_number', 'phone', 'mobile']) ?? '',
      address: pick(record, ['address', 'residentialaddress', 'residential_address']) ?? '',
    },
  };
}

/** Recursively dig through wrapper keys to find the person record. */
function digRecord(obj: Record<string, unknown>): Record<string, unknown> | null {
  const personKeys = ['firstname', 'first_name', 'lastname', 'last_name', 'surname', 'bvn', 'bvnnumber'];
  const lower = Object.keys(obj).map(k => k.toLowerCase());
  if (personKeys.some(pk => lower.includes(pk))) return obj;

  for (const wrapper of ['data', 'record', 'result', 'details', 'customer', 'kyc', 'bvn', 'nin']) {
    const next = obj[wrapper];
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      return digRecord(next as Record<string, unknown>);
    }
  }
  return obj;
}

/** First non-empty value whose key matches one of the candidates (case-insensitive). */
function pick(record: Record<string, unknown>, keys: string[]): string | null {
  for (const wanted of keys) {
    for (const [k, v] of Object.entries(record)) {
      if (k.toLowerCase() === wanted && v !== null && v !== '' && v !== undefined) {
        return String(v);
      }
    }
  }
  return null;
}
