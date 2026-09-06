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
 * Strict high-intent private-data matchers — only fire on real extracted text.
 * Zero invented coordinates: every hit inherits the token's real glyph rect.
 */
/** Financial balances & totals (currency symbol OR thousands-grouped amount). */
export const FINANCIAL_RE =
  /(?:[$€£R]\s?[\d,]+(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})\b)/g;

/** Account / card digit runs (8–18 digits, optional single spaces or dashes). */
export const ACCOUNT_RE = /\b\d(?:[ -]?\d){7,17}\b/g;

/** Phone numbers (local + optional country code). */
export const PHONE_RE =
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/** Email — still private; never invents a box without real text. */
export const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** SSN-style identifiers. */
export const IDENTITY_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/** Reject lone calendar years mistaken for short account numbers. */
export function isFourDigitYear(digits: string): boolean {
  if (digits.length !== 4) return false;
  const n = parseInt(digits, 10);
  return n >= 1900 && n <= 2100;
}

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

function accountBadge(value: string): ThreatBadge {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
    return 'Card Number';
  }
  return 'Bank Account';
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
 * Classify real PDF.js / Vision line tokens into Private Details.
 * Input tokens MUST already be UI-space (top-left origin) and bound real text.
 * If no token text matches a pattern, the result count is 0 — no phantom boxes.
 */
export function classifyTextTokens(tokens: TextToken[]): ThreatItem[] {
  const out: ThreatItem[] = [];

  for (const token of tokens) {
    const text = token.text.replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue;
    // Reject degenerate rects (blank / zero-area) — no phantom boxes.
    if (token.rect.width < 0.004 || token.rect.height < 0.004) continue;

    matchCategory(
      'financial',
      FINANCIAL_RE,
      { ...token, text },
      out,
      () => 'Total / Balance',
    );

    matchCategory(
      'financial',
      ACCOUNT_RE,
      { ...token, text },
      out,
      accountBadge,
      (m) => {
        const digits = m.replace(/\D/g, '');
        // Only flag account-length strings; never lone years like 2024–2026.
        if (isFourDigitYear(digits)) return false;
        if (digits.length < 8 || digits.length > 18) return false;
        // Card-length runs must pass Luhn; shorter account runs are accepted.
        if (digits.length >= 13 && digits.length <= 19) return luhnOk(digits);
        return true;
      },
    );

    matchCategory(
      'contact',
      PHONE_RE,
      { ...token, text },
      out,
      () => 'Phone Number',
      (m) => {
        const digits = m.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) return false;
        // Bare digit runs belong to account matching — phones need formatting.
        if (/^\d+$/.test(m.trim())) return false;
        // Luhn-valid card-length strings are accounts, not phones.
        if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
          return false;
        }
        return true;
      },
    );

    matchCategory('contact', EMAIL_RE, { ...token, text }, out, () => 'Email');

    matchCategory(
      'identity',
      IDENTITY_RE,
      { ...token, text },
      out,
      () => 'ID Number',
    );
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
