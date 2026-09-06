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
  | 'custom';

export const THREAT_CATEGORY_LABEL: Record<ThreatCategory, string> = {
  invoice: '🧾 Invoice Details',
  banking: '🏦 Banking & Balances',
  contact: '📞 Contact Info',
  identity: 'ID Numbers',
  custom: 'Other Details',
};

export const THREAT_CATEGORY_ICON: Record<ThreatCategory, string> = {
  invoice: 'receipt-outline',
  banking: 'card-outline',
  contact: 'call-outline',
  identity: 'id-card-outline',
  custom: 'document-text-outline',
};

/**
 * Plain English checklist badges.
 */
export type ThreatBadge =
  | 'Bank Account'
  | 'Total / Balance'
  | 'Card Number'
  | 'Phone Number'
  | 'Email'
  | 'ID Number'
  | 'Name'
  | 'Address'
  | 'Date'
  | 'Private Field'
  | 'IBAN';

export const THREAT_BADGE_LABEL: Record<ThreatBadge, string> = {
  'Bank Account': 'Bank Account',
  'Total / Balance': 'Total / Balance',
  'Card Number': 'Card Number',
  'Phone Number': 'Phone Number',
  Email: 'Email',
  'ID Number': 'ID Number',
  Name: 'Name',
  Address: 'Address',
  Date: 'Date',
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

/** Mask sensitive snippets for checklist display. */
export function maskThreatText(badge: ThreatBadge, text: string): string {
  const trimmed = text.trim();
  const digits = trimmed.replace(/\D/g, '');

  switch (badge) {
    case 'Bank Account':
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
      if (digits.length >= 4) return `ID: •••-••-${digits.slice(-4)}`;
      return `ID: ${trimmed}`;
    case 'Name':
      return trimmed.toLowerCase().startsWith('billed')
        ? trimmed
        : `Billed To: ${trimmed}`;
    case 'Address':
      return trimmed.toLowerCase().startsWith('address')
        ? trimmed
        : `Address: ${trimmed}`;
    default:
      return trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed;
  }
}
