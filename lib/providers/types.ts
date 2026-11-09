/** What every provider adapter returns, whatever the upstream API looks like. */
export type Identity = {
  surname: string;
  firstName: string;
  middleName: string;
  /** YYYY-MM-DD */
  dob: string;
  gender: 'Male' | 'Female' | '';
  phone?: string;
  stateOfOrigin?: string;
  idNumber: string;
};

export type Lookup<T> = { found: true; data: T } | { found: false };

export type BvnRecord = {
  bvn: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phoneNumber: string;
  address: string;
};

export type TinRecord = {
  tin: string;
  registeredName: string;
  taxpayerType: string;
  taxOffice: string;
  status: string;
};

export class ProviderError extends Error {
  constructor(message: string, public provider: string) {
    super(message);
  }
}
