import {
  flattenPdfNative,
  recognizeDocumentNative,
  type VisionEntityBox,
  type VisionRawBox,
} from '../../modules/vision-ocr';
import type { RedactionRect } from '../models/redaction';
import {
  maskThreatText,
  type OcrSnapLine,
  type TextToken,
  type ThreatBadge,
  type ThreatCategory,
  type ThreatItem,
} from '../models/threat';
import { uuidv4 } from './redactionEngine';
import { classifyTextTokens, tokensToSnapLines } from './threatClassifier';
import { visionBoxToUiRect } from './visionOcr';

const BADGES = new Set<ThreatBadge>([
  'Bank Account',
  'Routing Number',
  'Total / Balance',
  'Card Number',
  'Phone Number',
  'Email',
  'ID Number',
  'Tax ID',
  'Passport',
  'Name',
  'Organization',
  'Address',
  'Date',
  'Classification',
  'Private Field',
  'IBAN',
]);

function asBadge(value: string): ThreatBadge {
  return BADGES.has(value as ThreatBadge) ? (value as ThreatBadge) : 'Private Field';
}

function categoryFor(raw: string, badge: ThreatBadge): ThreatCategory {
  if (raw === 'marker' || badge === 'Classification') return 'marker';
  if (raw === 'contacts' || badge === 'Email' || badge === 'Phone Number' || badge === 'Address') {
    return 'contact';
  }
  if (raw === 'tax' || badge === 'ID Number' || badge === 'Tax ID' || badge === 'Passport') {
    return 'identity';
  }
  if (raw === 'personal' || badge === 'Name' || badge === 'Organization') return 'identity';
  if (badge === 'Total / Balance') return 'invoice';
  if (raw === 'financial') return 'banking';
  return 'custom';
}

function tokenFromBox(box: VisionRawBox, pageIndex: number): TextToken | null {
  const text = String(box.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const rect = visionBoxToUiRect(box);
  if (rect.width < 0.002 || rect.height < 0.002) return null;
  return { text, pageIndex, rect };
}

const NAME_STOP =
  /^(total|balance|invoice|statement|amount|paid|tax|vat|subtotal|page|date|receipt|debit|credit|description|transfer|reference|account|number|phone|email|address|qty|quantity|item|items|payment|due|from|to|the|and)$/i;

function looksLikeNamedEntity(text: string, badge: ThreatBadge): boolean {
  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, ''))
    .filter((word) => word.length > 1 && !NAME_STOP.test(word));
  if (badge === 'Name') return words.length >= 2 && words.every((word) => /[A-Za-z]{2,}/.test(word));
  return (
    words.length >= 2 ||
    /\b(ltd|inc|pty|llc|gmbh|corp|limited|plc|bank)\b/i.test(text)
  );
}

function threatFromEntity(entity: VisionEntityBox, pageIndex: number): ThreatItem | null {
  const text = String(entity.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const rect = visionBoxToUiRect(entity);
  if (rect.width < 0.002 || rect.height < 0.002) return null;
  const badge = asBadge(String(entity.badge || ''));
  if ((badge === 'Name' || badge === 'Organization') && !looksLikeNamedEntity(text, badge)) {
    return null;
  }
  return {
    id: uuidv4(),
    category: categoryFor(String(entity.category || ''), badge),
    badge,
    text,
    displayText: maskThreatText(badge, text),
    pageIndex,
    rect,
    enabled: true,
  };
}

function overlapRatio(a: ThreatItem, b: ThreatItem): number {
  if (a.pageIndex !== b.pageIndex) return 0;
  const x0 = Math.max(a.rect.x, b.rect.x);
  const y0 = Math.max(a.rect.y, b.rect.y);
  const x1 = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width);
  const y1 = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  const area = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
  return area > 0 ? inter / area : 0;
}

export function mergeThreats(current: ThreatItem[], extra: ThreatItem[]): ThreatItem[] {
  const out = [...current];
  const keys = new Set(out.map(threatKey));
  for (const item of extra) {
    const key = threatKey(item);
    if (keys.has(key)) continue;
    const dup = out.find(
      (prev) => prev.badge === item.badge && overlapRatio(prev, item) > 0.55,
    );
    if (dup) {
      const prevArea = dup.rect.width * dup.rect.height;
      const nextArea = item.rect.width * item.rect.height;
      if (nextArea < prevArea) {
        dup.rect = item.rect;
        dup.text = item.text;
        dup.displayText = item.displayText;
      }
      continue;
    }
    keys.add(key);
    out.push(item);
  }
  return out
    .filter((item) => {
      if (item.badge !== 'Total / Balance') return true;
      return !out.some((other) => {
        if (other.id === item.id || other.badge === 'Total / Balance') return false;
        const otherArea = other.rect.width * other.rect.height;
        if (otherArea <= 0) return false;
        const x0 = Math.max(item.rect.x, other.rect.x);
        const y0 = Math.max(item.rect.y, other.rect.y);
        const x1 = Math.min(item.rect.x + item.rect.width, other.rect.x + other.rect.width);
        const y1 = Math.min(item.rect.y + item.rect.height, other.rect.y + other.rect.height);
        if (x1 <= x0 || y1 <= y0) return false;
        return ((x1 - x0) * (y1 - y0)) / otherArea > 0.6;
      });
    })
    .sort((a, b) => a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
}

function threatKey(item: ThreatItem): string {
  return `${item.pageIndex}|${item.badge}|${item.text.toLowerCase()}|${item.rect.x.toFixed(3)}|${item.rect.y.toFixed(3)}`;
}

export type OnDeviceScan = {
  tokens: TextToken[];
  threats: ThreatItem[];
  lines: OcrSnapLine[];
};

/**
 * Render each PDF or image page on-device, run Apple Vision, and classify
 * financial, contact, identity, tax, and classification hits. No network.
 */
export async function scanDocumentOnDevice(uri: string): Promise<OnDeviceScan> {
  const pages = await recognizeDocumentNative(uri);
  const tokens: TextToken[] = [];
  const nativeThreats: ThreatItem[] = [];

  for (const page of pages) {
    const pageIndex = Number.isFinite(page.pageIndex) ? page.pageIndex : 0;
    for (const box of page.tokens ?? []) {
      const token = tokenFromBox(box, pageIndex);
      if (token) tokens.push(token);
    }
    for (const entity of page.entities ?? []) {
      const item = threatFromEntity(entity, pageIndex);
      if (item) nativeThreats.push(item);
    }
  }

  return {
    tokens,
    threats: mergeThreats(nativeThreats, classifyTextTokens(tokens)),
    lines: tokensToSnapLines(tokens),
  };
}

/** Burn boxes into page pixels and write an image-only PDF. */
export async function flattenDocumentOnDevice(
  uri: string,
  redactions: RedactionRect[],
): Promise<string> {
  return flattenPdfNative(
    uri,
    redactions.map((redaction) => ({
      pageIndex: redaction.pageIndex,
      x: redaction.rect.x,
      y: redaction.rect.y,
      width: redaction.rect.width,
      height: redaction.rect.height,
    })),
  );
}
