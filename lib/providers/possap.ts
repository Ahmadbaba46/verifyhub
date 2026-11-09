import { Identity, Lookup, ProviderError } from './types';

const BASE = () => (process.env.POSSAP_BASE ?? 'https://api.possap.ng').replace(/\/+$/, '');
const ORIGIN = () => process.env.POSSAP_ORIGIN ?? 'https://possap.gov.ng';

function userAgent(): string {
  return process.env.PROVIDER_USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0';
}

/**
 * POSSAP NIN lookup.
 * POST {POSSAP_BASE}/auth/nin  { "idtype": "nin", "nin": "12345678901" }
 * Success is HTTP 201 (not 200). A 2xx carrying `success: true` and a populated
 * `data` object is the only outcome treated as a hit.
 */
export async function possapNinLookup(nin: string): Promise<Lookup<Identity>> {
  const cleaned = nin.replace(/\D/g, '');
  if (cleaned.length !== 11) {
    throw new ProviderError('NIN must be eleven digits', 'possap');
  }

  const res = await fetch(`${BASE()}/auth/nin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': ORIGIN(),
      'Referer': `${ORIGIN()}/`,
      'User-Agent': userAgent(),
    },
    body: JSON.stringify({ idtype: 'nin', nin: cleaned }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok && res.status !== 201) {
    const body = await res.text().catch(() => '');
    let msg = `POSSAP returned HTTP ${res.status}`;
    try {
      const j = JSON.parse(body);
      const upstream = j.message ?? j.responseMsg ?? j.msg ?? j.detail ?? j.error;
      if (upstream) msg += `: ${upstream}`;
    } catch { /* ignore parse errors */ }
    throw new ProviderError(msg, 'possap');
  }

  const payload = await res.json();
  const data = payload?.data;
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return { found: false };
  }

  return {
    found: true,
    data: {
      surname: data.last_name ?? '',
      firstName: data.first_name ?? '',
      middleName: data.middle_name ?? '',
      dob: normaliseDob(data.date_of_birth),
      gender: normaliseGender(data.gender),
      phone: data.phone_number ?? undefined,
      stateOfOrigin: data.state ?? undefined,
      idNumber: data.nin ?? cleaned,
    },
  };
}

/** Convert dd/mm/yyyy or yyyy-mm-dd to YYYY-MM-DD. */
function normaliseDob(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  // yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function normaliseGender(raw: unknown): 'Male' | 'Female' | '' {
  if (!raw || typeof raw !== 'string') return '';
  const g = raw.trim().toLowerCase();
  if (g === 'm' || g === 'male') return 'Male';
  if (g === 'f' || g === 'female') return 'Female';
  return '';
}
