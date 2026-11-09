import { Identity, Lookup, TinRecord, BvnRecord } from './types';
import { mockBvn, mockNin, mockPassport, mockTin } from './mock';
import { possapNinLookup } from './possap';
import { renmoneyBvnLookup } from './renmoney';
import { nisPassportLookup } from './nis';

/**
 * Provider layer — live adapters with mock fallback.
 *
 * Each provider checks its own env vars. If the required vars are absent the
 * mock is used instead, so the app works out of the box for development.
 */

const hasPossap = () => !!(process.env.POSSAP_BASE || process.env.NIN_API_URL);
const hasRenmoney = () => !!(process.env.RENMONEY_AES_KEY && process.env.SOURCE_APP_ID);
const hasNis = () => !!(process.env.NIS_BASE);

export const usingMocks = () => !hasPossap();

export async function lookupNin(nin: string): Promise<Lookup<Identity>> {
  if (!hasPossap()) return mockNin(nin);
  return possapNinLookup(nin);
}

export async function lookupBvn(bvn: string, email?: string): Promise<Lookup<BvnRecord>> {
  if (!hasRenmoney()) return mockBvn(bvn); // falls back to sample data until Renmoney is configured
  return renmoneyBvnLookup(bvn, email);
}

export async function lookupPassport(number: string, dob: string): Promise<Lookup<Identity>> {
  if (!hasNis()) return mockPassport(number, dob);
  // NIS passport lookup requires a NIN as well; the caller in match/route.ts
  // passes it via nisPassportLookup directly. This fallback uses the mock.
  return mockPassport(number, dob);
}

/**
 * NIN + Passport match via the NIS portal.
 * Called from the match route when NIS is configured.
 */
export async function lookupNinPassport(nin: string, passport: string, dob: string): Promise<Lookup<Identity>> {
  if (!hasNis()) return mockPassport(passport, dob);
  return nisPassportLookup(nin, passport, dob);
}

export async function lookupTin(input: { nin?: string; rc?: string; type: string }): Promise<Lookup<TinRecord>> {
  // TIN provider not yet configured — always use mock.
  return mockTin(input);
}
