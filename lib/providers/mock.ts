import { Identity, Lookup, ProviderError, TinRecord } from './types';

/**
 * Deterministic fake data so you can build and demo without provider keys.
 * - NIN or passport ending 000 -> not found. Ending 999 -> provider outage.
 * - The last digit picks the person, so NIN ...1 and passport A00000001 are the same person.
 * - A passport ending 7 has a one-letter spelling difference in the middle name, to show a mismatch.
 */
const PEOPLE: Omit<Identity, 'idNumber'>[] = [
  { surname: 'Sani', firstName: 'Fatima', middleName: 'Abdullahi', dob: '1994-03-14', gender: 'Female', phone: '08030004821', stateOfOrigin: 'Kano' },
  { surname: 'Okafor', firstName: 'Tunde', middleName: 'Chinedu', dob: '1989-11-02', gender: 'Male', phone: '08051234567', stateOfOrigin: 'Anambra' },
  { surname: 'Lawal', firstName: 'Zainab', middleName: 'Ibrahim', dob: '1997-07-21', gender: 'Female', phone: '08099887766', stateOfOrigin: 'Kwara' },
  { surname: 'Obi', firstName: 'Emeka', middleName: 'Nnamdi', dob: '1992-01-30', gender: 'Male', phone: '07012345678', stateOfOrigin: 'Enugu' },
  { surname: 'Garba', firstName: 'Halima', middleName: 'Musa', dob: '2000-09-09', gender: 'Female', phone: '08166554433', stateOfOrigin: 'Kaduna' },
];

const pick = (id: string) => PEOPLE[Number(id.slice(-1)) % PEOPLE.length];

export async function mockNin(nin: string): Promise<Lookup<Identity>> {
  if (nin.endsWith('999')) throw new ProviderError('NIN provider is unavailable', 'nin');
  if (nin.endsWith('000')) return { found: false };
  return { found: true, data: { ...pick(nin), idNumber: nin } };
}

export async function mockPassport(number: string, dob: string): Promise<Lookup<Identity>> {
  if (number.endsWith('999')) throw new ProviderError('Passport provider is unavailable', 'passport');
  if (number.endsWith('000')) return { found: false };
  const base = pick(number);
  // One-letter spelling difference, to demonstrate a mismatch row.
  const middleName = number.endsWith('7') ? base.middleName.slice(0, -1) + 'x' : base.middleName;
  return { found: true, data: { ...base, middleName, dob: dob || base.dob, phone: undefined, stateOfOrigin: undefined, idNumber: number } };
}

const TYPES_OFFICE: Record<string, string> = { Individual: 'Kano Metro', 'Business name': 'Ikeja', 'Limited company': 'Lagos Island', Partnership: 'Abuja Wuse', 'NGO / association': 'Abuja Garki' };

export async function mockTin(input: { nin?: string; rc?: string; type: string }): Promise<Lookup<TinRecord>> {
  const id = input.nin ?? input.rc ?? '';
  if (id.endsWith('999')) throw new ProviderError('TIN provider is unavailable', 'tin');
  if (id.endsWith('000')) return { found: false };
  const person = input.nin ? pick(id) : null;
  const digits = id.replace(/\D/g, '').padStart(8, '0').slice(-8);
  return {
    found: true,
    data: {
      tin: `${digits}-0001`,
      registeredName: person ? `${person.firstName} ${person.middleName} ${person.surname}` : `Sample Ventures ${digits.slice(-3)} Limited`,
      taxpayerType: input.type,
      taxOffice: TYPES_OFFICE[input.type] ?? 'Abuja',
      status: 'Active',
    },
  };
}
