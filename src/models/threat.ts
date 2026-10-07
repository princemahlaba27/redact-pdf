import type { NormalizedRect } from './redaction';

/**
 * Private Details checklist groups (plain English + emoji headers).
 * Spec: Invoice Details · Banking & Balances · Contact Info
 */
export type ThreatCategory =
  | 'invoice'
  | 'banking'
  | 'contact'
  | 'identity'
  | 'marker'
  | 'custom';

export const THREAT_CATEGORY_LABEL: Record<ThreatCategory, string> = {
  invoice: '🧾 Invoice Details',
  banking: '🏦 Banking & Balances',
  contact: '📞 Contact Info',
  identity: 'ID Numbers',
  marker: 'Classification',
  custom: 'Other Details',
};

export const THREAT_CATEGORY_ICON: Record<ThreatCategory, string> = {
  invoice: 'receipt-outline',
  banking: 'card-outline',
  contact: 'call-outline',
  identity: 'id-card-outline',
  marker: 'lock-closed-outline',
  custom: 'document-text-outline',
};

/**
 * Plain English checklist badges.
 */
export type ThreatBadge =
  | 'Bank Account'
  | 'Routing Number'
  | 'Total / Balance'
  | 'Card Number'
  | 'Phone Number'
  | 'Email'
  | 'ID Number'
  | 'Tax ID'
  | 'Passport'
  | 'Name'
  | 'Organization'
  | 'Address'
  | 'Date'
  | 'Classification'
  | 'Private Field'
  | 'IBAN';

export const THREAT_BADGE_LABEL: Record<ThreatBadge, string> = {
  'Bank Account': 'Bank Account',
  'Routing Number': 'Routing Number',
  'Total / Balance': 'Total / Balance',
  'Card Number': 'Card Number',
  'Phone Number': 'Phone Number',
  Email: 'Email',
  'ID Number': 'ID Number',
  'Tax ID': 'Tax ID',
  Passport: 'Passport',
  Name: 'Name',
  Organization: 'Organization',
  Address: 'Address',
  Date: 'Date',
  Classification: 'Classification',
  'Private Field': 'Private Field',
  IBAN: 'IBAN',
};

export type ThreatItem = {
  id: string;
  category: ThreatCategory;
  badge: ThreatBadge;
  /** Exact extracted snippet (raw). */
  text: string;
  /** Masked display string for the checklist row. */
  displayText: string;
  pageIndex: number;
  /** Normalized 0–1 rect in UI space (origin top-left). */
  rect: NormalizedRect;
  /** When false, blackout is removed from the canvas / export. */
  enabled: boolean;
};

/** Raw OCR / PDF text token before classification. */
export type TextToken = {
  text: string;
  pageIndex: number;
  rect: NormalizedRect;
};

/** Full OCR / PDF text line used by the text-snap highlighter brush. */
export type OcrSnapLine = {
  text: string;
  pageIndex: number;
  rect: NormalizedRect;
};

export type RedactionFilterId = 'all' | 'financial' | 'contacts' | 'personal' | 'tax';

export const REDACTION_FILTERS: { id: RedactionFilterId; label: string }[] = [
  { id: 'all', label: '✨ Auto-Redact All' },
  { id: 'financial', label: 'Financial' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'personal', label: 'Personal' },
  { id: 'tax', label: 'Tax/ID' },
];

export function threatInFilter(
  item: ThreatItem,
  filter: Exclude<RedactionFilterId, 'all'>,
): boolean {
  switch (filter) {
    case 'financial':
      return (
        item.category === 'banking' ||
        item.category === 'invoice' ||
        item.badge === 'Card Number' ||
        item.badge === 'Bank Account' ||
        item.badge === 'Routing Number' ||
        item.badge === 'IBAN' ||
        item.badge === 'Total / Balance'
      );
    case 'contacts':
      return (
        item.category === 'contact' ||
        item.badge === 'Email' ||
        item.badge === 'Phone Number' ||
        item.badge === 'Address'
      );
    case 'personal':
      return (
        item.category === 'marker' ||
        item.badge === 'Name' ||
        item.badge === 'Organization' ||
        item.badge === 'Classification'
      );
    case 'tax':
      return (
        item.badge === 'ID Number' ||
        item.badge === 'Tax ID' ||
        item.badge === 'Passport'
      );
    default:
      return false;
  }
}
export function maskThreatText(badge: ThreatBadge, text: string): string {
  const trimmed = text.trim();
  const digits = trimmed.replace(/\D/g, '');

  switch (badge) {
    case 'Bank Account':
    case 'Routing Number':
    case 'Card Number':
    case 'IBAN':
      if (digits.length >= 4) return `Account: ••••${digits.slice(-4)}`;
      return `Account: ${trimmed}`;
    case 'Total / Balance': {
      // Prefer "Total: …" / "Ending Balance" style from already-formatted text.
      if (/^(total|subtotal|balance|amount|vat|tax|price|ending)\b/i.test(trimmed)) {
        return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
      }
      return `Total: ${trimmed}`;
    }
    case 'Phone Number':
      if (digits.length >= 4) return `Phone: ••••${digits.slice(-4)}`;
      return `Phone: ${trimmed}`;
    case 'Email': {
      const at = trimmed.indexOf('@');
      if (at > 1) return `Email: ${trimmed[0]}•••${trimmed.slice(at)}`;
      return `Email: ${trimmed}`;
    }
    case 'ID Number':
    case 'Tax ID':
    case 'Passport':
      if (digits.length >= 4) return `ID: •••-••-${digits.slice(-4)}`;
      return `ID: ${trimmed}`;
    case 'Name':
    case 'Organization':
      return trimmed.toLowerCase().startsWith('billed')
        ? trimmed
        : `Billed To: ${trimmed}`;
    case 'Classification':
      return trimmed;
    case 'Address':
      return trimmed.toLowerCase().startsWith('address')
        ? trimmed
        : `Address: ${trimmed}`;
    default:
      return trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed;
  }
}
