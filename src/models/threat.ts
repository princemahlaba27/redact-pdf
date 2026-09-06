import type { NormalizedRect } from './redaction';

/** Categories for the Private Details checklist. */
export type ThreatCategory = 'financial' | 'contact' | 'identity' | 'custom';

export const THREAT_CATEGORY_LABEL: Record<ThreatCategory, string> = {
  financial: 'Banking & Balances',
  contact: 'Contact & Phone',
  identity: 'Government & Personal',
  custom: 'Labeled Fields',
};

export const THREAT_CATEGORY_ICON: Record<ThreatCategory, string> = {
  financial: 'card-outline',
  contact: 'call-outline',
  identity: 'id-card-outline',
  custom: 'document-text-outline',
};

/** Plain badge shown on checklist rows (Apple HIG — no jargon). */
export type ThreatBadge =
  | 'Balance'
  | 'Account Number'
  | 'Card'
  | 'Phone'
  | 'Email'
  | 'SSN'
  | 'ID Number'
  | 'Name'
  | 'Address'
  | 'Date'
  | 'Private Field';

export type ThreatItem = {
  id: string;
  category: ThreatCategory;
  badge: ThreatBadge;
  /** Exact extracted snippet shown in the checklist. */
  text: string;
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
