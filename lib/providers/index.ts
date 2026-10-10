import { Identity, Lookup, ProviderError, TinRecord } from './types';
import { mockNin, mockPassport, mockTin } from './mock';

/**
 * Generic JSON-over-HTTP adapter.
 *
 * Your real providers each have their own request and response shapes. When you pick them, change ONLY the
 * `toRequest` / `fromResponse` functions below so they return the normalised types in ./types. Nothing else
 * in the app needs to change.
 */
async function call(name: string, urlEnv: string, keyEnv: string, body: unknown): Promise<any> {
  const url = process.env[urlEnv];
  const key = process.env[keyEnv];
  if (!url || !key) return null; // not configured -> caller falls back to mock
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.status === 404) return { __notFound: true };
    if (!res.ok) throw new ProviderError(`${name} provider returned ${res.status}`, name);
    return await res.json();
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(`${name} provider did not respond`, name);
  } finally {
    clearTimeout(timer);
  }
}

export const usingMocks = () => !(process.env.NIN_API_URL && process.env.NIN_API_KEY);

export async function lookupNin(nin: string): Promise<Lookup<Identity>> {
  const raw = await call('nin', 'NIN_API_URL', 'NIN_API_KEY', { nin });
  if (raw === null) return mockNin(nin);
  if (raw.__notFound || !raw.data) return { found: false };
  // TODO(provider): map the real response here.
  return { found: true, data: { ...raw.data, idNumber: nin } as Identity };
}

export async function lookupPassport(number: string, dob: string): Promise<Lookup<Identity>> {
  const raw = await call('passport', 'PASSPORT_API_URL', 'PASSPORT_API_KEY', { passport_number: number, dob });
  if (raw === null) return mockPassport(number, dob);
  if (raw.__notFound || !raw.data) return { found: false };
  // TODO(provider): map the real response here.
  return { found: true, data: { ...raw.data, idNumber: number } as Identity };
}

export async function lookupTin(input: { nin?: string; rc?: string; type: string }): Promise<Lookup<TinRecord>> {
  const raw = await call('tin', 'TIN_API_URL', 'TIN_API_KEY', input);
  if (raw === null) return mockTin(input);
  if (raw.__notFound || !raw.data) return { found: false };
  // TODO(provider): map the real response here.
  return { found: true, data: raw.data as TinRecord };
}
