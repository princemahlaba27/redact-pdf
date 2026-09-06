import type { NormalizedRect, RedactionStyle } from '../models/redaction';
import type {
  TextToken,
  ThreatBadge,
  ThreatCategory,
  ThreatItem,
} from '../models/threat';
import { maskThreatText } from '../models/threat';
import { uuidv4 } from './redactionEngine';

/**
 * Deterministic matchers — only fire on real extracted token text.
 * Spec patterns:
 * - Currency: /(?:[\$€£R]\s?[\d,]+(?:\.\d{2})?)/g
 * - Card segments: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/
 * - Accounts: 8–18 digit runs
 * - Phones: local + intl
 * - SSN: \d{3}-\d{2}-\d{4}
 */
export const FINANCIAL_RE =
  /(?:[$€£R]\s?[\d,]+(?:\.\d{2})?|\b\d{4}[-\s]?\d{4}[-\s]?\d{4}(?:[-\s]?\d{1,4})?\b|\b\d{8,18}\b)/g;

export const CONTACT_RE =
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const IDENTITY_RE = /\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{1,3}\d{5,9}[A-Z0-9]?\b/g;

const LABEL_RE =
  /\b(?:Account\s*Name|Account\s*Holder|Account\s*(?:No|Number|#)|Balance\s*Due|Amount\s*Due|Total\s*Due|Customer\s*Name|Full\s*Name|Date\s*of\s*Birth|DOB|Billing\s*Address|Mailing\s*Address|Home\s*Address|SSN|Tax\s*ID|EIN)\s*[:#-]?\s*(.+)$/i;

function luhnOk(digits: string): boolean {
  let sum = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) {
    let d = parseInt(rev[i], 10);
    if (Number.isNaN(d)) return false;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function clampRect(r: NormalizedRect): NormalizedRect {
  const x = Math.min(Math.max(r.x, 0), 1);
  const y = Math.min(Math.max(r.y, 0), 1);
  return {
    x,
    y,
    width: Math.min(Math.max(r.width, 0.008), 1 - x),
    height: Math.min(Math.max(r.height, 0.01), 1 - y),
  };
}

function pad(r: NormalizedRect, dx = 0.004, dy = 0.003): NormalizedRect {
  return clampRect({
    x: r.x - dx,
    y: r.y - dy,
    width: r.width + dx * 2,
    height: r.height + dy * 2,
  });
}

/**
 * Slice a line rect to the horizontal span of a substring match.
 * Never invents Y — always inherits the real token's y/height.
 */
function sliceRectForMatch(
  lineRect: NormalizedRect,
  lineText: string,
  matchIndex: number,
  matchLength: number,
): NormalizedRect {
  const len = Math.max(lineText.length, 1);
  const start = Math.max(0, matchIndex) / len;
  const end = Math.min(1, (matchIndex + matchLength) / len);
  return clampRect({
    x: lineRect.x + lineRect.width * start,
    y: lineRect.y,
    width: lineRect.width * Math.max(end - start, 0.03),
    height: lineRect.height,
  });
}

function financialBadge(value: string): ThreatBadge {
  if (/[$€£R]/.test(value)) return 'Total / Balance';
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 13 && digits.length <= 19) return 'Card Number';
  return 'Bank Account';
}

function contactBadge(value: string): ThreatBadge {
  return value.includes('@') ? 'Email' : 'Phone Number';
}

function identityBadge(_value: string): ThreatBadge {
  return 'ID Number';
}

function customBadge(labelLine: string): ThreatBadge {
  if (/address/i.test(labelLine)) return 'Address';
  if (/date|dob/i.test(labelLine)) return 'Date';
  if (/name/i.test(labelLine)) return 'Name';
  if (/account/i.test(labelLine)) return 'Bank Account';
  if (/balance|total|amount/i.test(labelLine)) return 'Total / Balance';
  return 'Private Field';
}

function pushUnique(out: ThreatItem[], item: ThreatItem) {
  const key = `${item.pageIndex}|${item.badge}|${item.text.toLowerCase()}|${item.rect.x.toFixed(3)}|${item.rect.y.toFixed(3)}`;
  if (
    out.some(
      (t) =>
        `${t.pageIndex}|${t.badge}|${t.text.toLowerCase()}|${t.rect.x.toFixed(3)}|${t.rect.y.toFixed(3)}` ===
        key,
    )
  ) {
    return;
  }
  out.push(item);
}

function makeItem(
  category: ThreatCategory,
  badge: ThreatBadge,
  value: string,
  pageIndex: number,
  rect: NormalizedRect,
): ThreatItem {
  const text = value.trim();
  return {
    id: uuidv4(),
    category,
    badge,
    text,
    displayText: maskThreatText(badge, text),
    pageIndex,
    rect: pad(rect),
    enabled: true,
  };
}

function matchCategory(
  category: ThreatCategory,
  re: RegExp,
  token: TextToken,
  out: ThreatItem[],
  badgeFor: (m: string) => ThreatBadge,
  filter?: (m: string) => boolean,
) {
  const text = token.text;
  // Skip tokens with no real glyphs — never invent empty blackout boxes.
  if (!text.replace(/\s/g, '').length) return;

  for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
    const value = m[0];
    if (filter && !filter(value)) continue;
    const idx = m.index ?? text.indexOf(value);
    if (idx < 0) continue;
    pushUnique(
      out,
      makeItem(
        category,
        badgeFor(value),
        value,
        token.pageIndex,
        sliceRectForMatch(token.rect, text, idx, value.length),
      ),
    );
  }
}

/**
 * Classify real PDF/OCR line tokens into Private Details.
 * Input tokens MUST already be UI-space (top-left origin) and bound real text.
 */
export function classifyTextTokens(tokens: TextToken[]): ThreatItem[] {
  const out: ThreatItem[] = [];

  for (const token of tokens) {
    const text = token.text.replace(/\s+/g, ' ').trim();
    if (text.length < 3) continue;
    // Reject degenerate rects (blank / zero-area) — no phantom boxes.
    if (token.rect.width < 0.004 || token.rect.height < 0.004) continue;

    matchCategory(
      'financial',
      FINANCIAL_RE,
      { ...token, text },
      out,
      financialBadge,
      (m) => {
        const digits = m.replace(/\D/g, '');
        if (/[$€£R]/.test(m)) return true;
        if (digits.length >= 13 && digits.length <= 19) return luhnOk(digits);
        if (digits.length >= 8 && digits.length <= 18) return true;
        return /[-\s]/.test(m) && digits.length >= 6;
      },
    );

    matchCategory('contact', CONTACT_RE, { ...token, text }, out, contactBadge);

    matchCategory(
      'identity',
      IDENTITY_RE,
      { ...token, text },
      out,
      identityBadge,
      (m) => {
        if (/^\d{3}-\d{2}-\d{4}$/.test(m)) return true;
        return /[A-Z]/.test(m) && /\d/.test(m) && m.length >= 6;
      },
    );

    const label = text.match(LABEL_RE);
    if (label?.[1]?.trim()) {
      const value = label[1].trim();
      if (value.length >= 2) {
        const idx = text.lastIndexOf(value);
        pushUnique(
          out,
          makeItem(
            'custom',
            customBadge(text),
            value.slice(0, 64),
            token.pageIndex,
            sliceRectForMatch(token.rect, text, idx, value.length),
          ),
        );
      }
    }
  }

  return out.sort(
    (a, b) =>
      a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
}

export function threatsToRedactions(
  threats: ThreatItem[],
  style: RedactionStyle = 'black',
) {
  return threats
    .filter((t) => t.enabled)
    .map((t) => ({
      id: t.id,
      pageIndex: t.pageIndex,
      rect: t.rect,
      style,
      source: 'threat' as const,
    }));
}
