import type { NormalizedRect } from './redaction';

/** Categories for the Private Details checklist. */
export type ThreatCategory = 'financial' | 'contact' | 'identity' | 'custom';

export const THREAT_CATEGORY_LABEL: Record<ThreatCategory, string> = {
  financial: 'Money & Accounts',
  contact: 'Phone & Email',
  identity: 'ID Numbers',
  custom: 'Other Details',
};

export const THREAT_CATEGORY_ICON: Record<ThreatCategory, string> = {
  financial: 'card-outline',
  contact: 'call-outline',
  identity: 'id-card-outline',
  custom: 'document-text-outline',
};

/**
 * Plain English checklist labels (no developer jargon).
 * Spec: Bank Account · Total / Balance · Phone Number · ID Number
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
  | 'Private Field';

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

/** Mask sensitive snippets for checklist display. */
export function maskThreatText(badge: ThreatBadge, text: string): string {
  const trimmed = text.trim();
  const digits = trimmed.replace(/\D/g, '');

  switch (badge) {
    case 'Bank Account':
    case 'Card Number':
      if (digits.length >= 4) return `Account: ••••${digits.slice(-4)}`;
      return `Account: ${trimmed}`;
    case 'Total / Balance':
      return `Balance: ${trimmed}`;
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
    default:
      return trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed;
  }
}
