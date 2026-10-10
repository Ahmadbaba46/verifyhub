import type { Identity, TinRecord } from './providers/types';
import { buildSlip } from './slip';

export type DocKey = 'nin_slip' | 'tin_slip' | 'tin_certificate';

/** Which price and which check type each document belongs to. */
export const DOCS: Record<DocKey, { service: string; priceKey: string; title: string; filename: string; needsVia?: 'nin' | 'rc' }> = {
  nin_slip: { service: 'nin', priceKey: 'nin_slip', title: 'NIN verification slip', filename: 'nin-slip' },
  tin_slip: { service: 'tin', priceKey: 'tin_slip', title: 'Tax ID slip', filename: 'tin-slip', needsVia: 'nin' },
  tin_certificate: { service: 'tin', priceKey: 'tin_certificate', title: 'Tax ID certificate', filename: 'tin-certificate', needsVia: 'rc' },
};

const fmtDate = (iso: string) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

export function renderDocument(doc: DocKey, data: unknown, reference: string) {
  if (doc === 'nin_slip') {
    const d = data as Identity;
    return buildSlip({
      title: DOCS[doc].title, reference, issuedAt: new Date(),
      rows: [
        ['Surname', d.surname], ['First name', d.firstName], ['Middle name', d.middleName],
        ['Date of birth', fmtDate(d.dob)], ['Gender', d.gender], ['State of origin', d.stateOfOrigin ?? ''],
        ['NIN', d.idNumber.replace(/(\d{4})(\d{4})(\d{3})/, '$1 $2 $3')],
      ],
    });
  }
  const t = data as TinRecord;
  return buildSlip({
    title: DOCS[doc].title, reference, issuedAt: new Date(),
    rows: [
      ['Tax identification number', t.tin], ['Registered name', t.registeredName],
      ['Taxpayer type', t.taxpayerType], ['Tax office', t.taxOffice], ['Status', t.status],
    ],
  });
}
