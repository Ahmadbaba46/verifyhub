import { Identity, Lookup, ProviderError } from './types';

const BASE = () => (process.env.NIS_BASE ?? 'https://passport.immigration.gov.ng').replace(/\/+$/, '');
const MODE = () => process.env.NIS_MODE ?? 'read';
const ALLOW_WRITES = () => process.env.NIS_ALLOW_WRITES === '1';
const APPLYING_FOR = () => process.env.NIS_APPLYING_FOR ?? 'REISSUE';

function userAgent(): string {
  return process.env.PROVIDER_USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0';
}

type Cookies = Record<string, string>;

async function nisCall(path: string, payload: unknown, token: string | null, cookies: Cookies): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': BASE(),
    'Referer': `${BASE()}/nin/`,
    'User-Agent': userAgent(),
  };

  if (token) {
    headers['APPLICATION_CREST'] = token;
    if (!cookies.authToken) cookies.authToken = token;
  }

  const cookiePairs = Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
  if (cookiePairs.length) headers['Cookie'] = cookiePairs.join('; ');

  const res = await fetch(`${BASE()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (['JSESSIONID', 'authToken'].includes(name)) cookies[name] = value;
    }
  }

  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { status: res.status, json };
}

function nisDetails(json: Record<string, unknown>): Record<string, unknown> | null {
  const d = json?.details;
  return d && typeof d === 'object' ? d as Record<string, unknown> : null;
}

function parseDob(text: string): [number, number, number] | null {
  const s = text.trim();
  let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return [Number(m[3]), Number(m[2]), Number(m[1])];
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function dobFields(day: number, month: number, year: number) {
  return {
    dateOfBirthDay: String(day),
    dateOfBirthMonth: String(month).padStart(2, '0'),
    dateOfBirthYear: String(year),
    dateOfBirth: `${day}/${String(month).padStart(2, '0')}/${year}`,
  };
}

function normaliseGender(raw: unknown): 'Male' | 'Female' | '' {
  if (!raw || typeof raw !== 'string') return '';
  const g = raw.trim().toLowerCase();
  if (g === 'm' || g === 'male') return 'Male';
  if (g === 'f' || g === 'female') return 'Female';
  return '';
}

function passportDob(r: Record<string, unknown>): string {
  const d = r.currentdateofbirthday ?? r.currentDateOfBirthDay;
  const m = r.currentdateofbirthmonth ?? r.currentDateOfBirthMonth;
  const y = r.currentdateofbirthyear ?? r.currentDateOfBirthYear;
  if (d && m && y) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const label = r.currentdateofbirthlabel ?? r.currentDateOfBirthLabel;
  if (label) return String(label);
  return '';
}

/**
 * NIS passport lookup — validates a NIN then optionally fetches the passport.
 *
 * Read mode (default): validates the NIN and stops. Nothing is written upstream.
 * Compare mode: additionally fetches passport details and compares locally.
 * Full mode: the portal's own comparison. Creates a real data-correction case.
 *
 * Compare and full require NIS_ALLOW_WRITES=1.
 */
export async function nisPassportLookup(nin: string, passport: string, dob: string): Promise<Lookup<Identity>> {
  const cleanedNin = nin.replace(/\D/g, '');
  if (cleanedNin.length !== 11) throw new ProviderError('NIN must be eleven digits', 'nis');

  const cleanedPassport = passport.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d{6,9}$/.test(cleanedPassport)) {
    throw new ProviderError('Passport number is not in the expected form', 'nis');
  }

  const parsed = parseDob(dob);
  if (!parsed) throw new ProviderError('A date of birth is required, as dd/mm/yyyy or yyyy-mm-dd.', 'nis');

  const mode = MODE();
  if (mode !== 'read' && !ALLOW_WRITES()) {
    throw new ProviderError(
      `NIS_MODE=${mode} creates a data-correction case on the immigration portal. Set NIS_ALLOW_WRITES=1 to permit it, or leave NIS_MODE=read.`,
      'nis',
    );
  }

  const [day, month, year] = parsed;
  const fields = dobFields(day, month, year);
  const cookies: Cookies = {};

  // 1 — session token
  const tokenRes = await nisCall('/app/v1/auth/serverToken', {}, null, cookies);
  const token = tokenRes.json?.bearerToken as string | undefined;
  if (!token) throw new ProviderError('The portal did not issue a session token.', 'nis');

  // 2 — validateNIN (read)
  const validateRes = await nisCall('/app/v2/application/validateNIN', {
    applyingFor: APPLYING_FOR(),
    nin: cleanedNin,
    ...fields,
  }, token, cookies);

  if (validateRes.status >= 400) {
    const msg = validateRes.json?.responseMsg ?? validateRes.json?.message ?? `NIS returned HTTP ${validateRes.status}`;
    throw new ProviderError(String(msg), 'nis');
  }

  const ninDetails = nisDetails(validateRes.json);
  if (!ninDetails || ninDetails.successful !== true) {
    return { found: false };
  }

  // Read mode stops here — nothing has been written upstream.
  if (mode === 'read') {
    return {
      found: true,
      data: {
        surname: String(ninDetails.lastname ?? ''),
        firstName: String(ninDetails.firstname ?? ''),
        middleName: String(ninDetails.middlename ?? ''),
        dob: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        gender: normaliseGender(ninDetails.gender),
        phone: undefined,
        stateOfOrigin: undefined,
        idNumber: cleanedNin,
      },
    };
  }

  // 3 — saveNIN (WRITE: creates the case, returns masterId)
  const saveRes = await nisCall('/app/v2/application/saveNIN', {
    applyingFor: APPLYING_FOR(),
    nin: cleanedNin,
    ...fields,
  }, token, cookies);

  const saveDetails = nisDetails(saveRes.json);
  const masterId = saveDetails?.masterId ?? saveDetails?.dataCorrectionId;
  if (!masterId) throw new ProviderError('The portal did not return a case ID.', 'nis');

  // 4 — fetchExistingPassportDetails
  const ppRes = await nisCall('/app/v2/cod/fetchExistingPassportDetails', {
    dataCorrectionId: masterId,
    passportNumber: cleanedPassport,
  }, token, cookies);

  const ppDetails = nisDetails(ppRes.json);
  if (!ppDetails) return { found: false };

  return {
    found: true,
    data: {
      surname: String(ppDetails.currentlastname ?? ppDetails.currentLastName ?? ''),
      firstName: String(ppDetails.currentfirstname ?? ppDetails.currentFirstName ?? ''),
      middleName: String(ppDetails.currentmiddlename ?? ppDetails.currentMiddleName ?? ''),
      dob: passportDob(ppDetails),
      gender: normaliseGender(ppDetails.currentgender ?? ppDetails.currentGender),
      phone: undefined,
      stateOfOrigin: undefined,
      idNumber: cleanedPassport,
    },
  };
}
