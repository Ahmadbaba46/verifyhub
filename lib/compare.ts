import type { Identity } from './providers/types';

export type FieldResult = { field: string; nin: string; passport: string; match: boolean };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');

export function compareIdentities(nin: Identity, passport: Identity): { fields: FieldResult[]; matched: number; total: number; verdict: 'match' | 'partial' | 'mismatch' } {
  const rows: [string, string, string, boolean][] = [
    ['Surname', nin.surname, passport.surname, norm(nin.surname) === norm(passport.surname)],
    ['First name', nin.firstName, passport.firstName, norm(nin.firstName) === norm(passport.firstName)],
    ['Middle name', nin.middleName, passport.middleName, norm(nin.middleName) === norm(passport.middleName)],
    ['Date of birth', nin.dob, passport.dob, nin.dob === passport.dob],
    ['Gender', nin.gender, passport.gender, nin.gender === passport.gender],
  ];
  const fields = rows.map(([field, a, b, match]) => ({ field, nin: a, passport: b, match }));
  const matched = fields.filter((f) => f.match).length;
  const verdict = matched === fields.length ? 'match' : matched >= fields.length - 1 && fields.slice(0, 2).every((f) => f.match) && fields[3].match ? 'partial' : 'mismatch';
  return { fields, matched, total: fields.length, verdict };
}
