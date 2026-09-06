import type { NormalizedRect, RedactionStyle } from '../models/redaction';
import type {
  OcrSnapLine,
  TextToken,
  ThreatBadge,
  ThreatCategory,
  ThreatItem,
} from '../models/threat';
import { maskThreatText } from '../models/threat';
import { uuidv4 } from './redactionEngine';

/**
 * High-precision invoice / statement / contact matchers.
 * Every hit inherits a real glyph rect — never invents empty boxes.
 */

/** Standalone currency / numeric totals (symbol optional). */
export const FINANCIAL_RE =
  /(?:[\$€£R¥]\s?)?\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})\b/g;

/** Account / card digit runs (8–20 digits, optional spaces or dashes). */
export const ACCOUNT_RE = /\b(?:\d[ -]*?){8,20}\b/g;

/** IBAN-style identifiers. */
export const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi;

/** Phone numbers (local + optional country code). */
export const PHONE_RE =
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/** Email — still private; never invents a box without real text. */
export const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** SSN-style identifiers. */
export const IDENTITY_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/** Street / mailing addresses. */
export const ADDRESS_RE =
  /\b\d{1,5}\s+[A-Za-z0-9\s.,#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Box)\b/gi;

/** Invoice / receipt anchor labels. */
export const INVOICE_ANCHOR_RE =
  /(?:total|balance due|amount due|subtotal|billed to|invoice to|recipient|vat|tax|payment due|price)\b/gi;

/** Bank statement balance anchors. */
export const BALANCE_ANCHOR_RE =
  /(?:(?:opening|closing)\s+balance|available\s+funds|\bbalance\b)/gi;

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

function unionRects(a: NormalizedRect, b: NormalizedRect): NormalizedRect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return clampRect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
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

/**
 * Line-level bounding box unioning.
 * Same horizontal text line when mid-Y variance ≤ 4px and X-gap < 12px
 * (normalized against a typical ~612×792 page when page size unknown).
 */
export function unionAdjacentWordRects(
  rects: NormalizedRect[],
  pageWidthPx = 612,
  pageHeightPx = 792,
): NormalizedRect[] {
  if (rects.length === 0) return [];
  const yTol = 4 / Math.max(pageHeightPx, 1);
  const xGap = 12 / Math.max(pageWidthPx, 1);

  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: NormalizedRect[] = [];

  for (const rect of sorted) {
    if (rect.width < 0.002 || rect.height < 0.002) continue;
    const midY = rect.y + rect.height / 2;
    let absorbed = false;
    for (let i = 0; i < merged.length; i++) {
      const m = merged[i];
      const mMid = m.y + m.height / 2;
      if (Math.abs(mMid - midY) > yTol) continue;
      const left = Math.min(m.x, rect.x);
      const right = Math.max(m.x + m.width, rect.x + rect.width);
      const gap =
        Math.max(m.x, rect.x) - Math.min(m.x + m.width, rect.x + rect.width);
      // Overlap (gap ≤ 0) or under 12px X-gap → union into one clean bar.
      if (gap <= xGap) {
        merged[i] = {
          x: left,
          y: Math.min(m.y, rect.y),
          width: right - left,
          height: Math.max(m.y + m.height, rect.y + rect.height) - Math.min(m.y, rect.y),
        };
        absorbed = true;
        break;
      }
    }
    if (!absorbed) merged.push({ ...rect });
  }
  return merged.map(clampRect);
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
  displayOverride?: string,
): ThreatItem {
  const text = value.trim();
  return {
    id: uuidv4(),
    category,
    badge,
    text,
    displayText: displayOverride ?? maskThreatText(badge, text),
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
  displayFor?: (m: string) => string,
) {
  const text = token.text;
  if (!text.replace(/\s/g, '').length) return;

  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
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
        displayFor?.(value),
      ),
    );
  }
}

type LineGroup = {
  midY: number;
  pageIndex: number;
  parts: TextToken[];
  text: string;
  rect: NormalizedRect;
};

function buildLineGroups(tokens: TextToken[]): LineGroup[] {
  const byPage = new Map<number, TextToken[]>();
  for (const t of tokens) {
    const list = byPage.get(t.pageIndex) ?? [];
    list.push(t);
    byPage.set(t.pageIndex, list);
  }

  const lines: LineGroup[] = [];
  for (const [pageIndex, pageTokens] of byPage) {
    const sorted = [...pageTokens].sort(
      (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x,
    );
    const groups: { midY: number; parts: TextToken[] }[] = [];
    for (const token of sorted) {
      if (token.rect.width < 0.004 || token.rect.height < 0.004) continue;
      const midY = token.rect.y + token.rect.height / 2;
      let line = groups.find(
        (L) => Math.abs(L.midY - midY) < Math.max(token.rect.height * 0.7, 0.012),
      );
      if (!line) {
        line = { midY, parts: [] };
        groups.push(line);
      }
      line.parts.push(token);
    }

    for (const g of groups) {
      g.parts.sort((a, b) => a.rect.x - b.rect.x);
      const text = g.parts
        .map((p) => p.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length < 1) continue;
      const x0 = Math.min(...g.parts.map((p) => p.rect.x));
      const y0 = Math.min(...g.parts.map((p) => p.rect.y));
      const x1 = Math.max(...g.parts.map((p) => p.rect.x + p.rect.width));
      const y1 = Math.max(...g.parts.map((p) => p.rect.y + p.rect.height));
      lines.push({
        midY: g.midY,
        pageIndex,
        parts: g.parts,
        text,
        rect: {
          x: x0,
          y: y0,
          width: Math.max(x1 - x0, 0.01),
          height: Math.max(y1 - y0, 0.01),
        },
      });
    }
  }

  return lines.sort(
    (a, b) => a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
}

/** Build snap-line geometry from raw tokens (Vision / pdf.js). */
export function tokensToSnapLines(tokens: TextToken[]): OcrSnapLine[] {
  return buildLineGroups(tokens).map((l) => ({
    text: l.text,
    pageIndex: l.pageIndex,
    rect: l.rect,
  }));
}

function isNameAnchor(label: string): boolean {
  return /billed to|invoice to|recipient/i.test(label);
}

function isAmountAnchor(label: string): boolean {
  return /total|balance due|amount due|subtotal|vat|tax|payment due|price|balance|available funds/i.test(
    label,
  );
}

function extractValueAfterLabel(
  line: LineGroup,
  labelIndex: number,
  labelLength: number,
): { text: string; rect: NormalizedRect } | null {
  const after = line.text.slice(labelIndex + labelLength).replace(/^[\s:.\-–—]+/, '');
  if (!after.trim()) return null;
  const start = line.text.indexOf(after, labelIndex + labelLength);
  if (start < 0) return null;
  return {
    text: after.trim(),
    rect: sliceRectForMatch(line.rect, line.text, start, after.trim().length),
  };
}

function firstAmountInText(
  text: string,
  rect: NormalizedRect,
): { text: string; rect: NormalizedRect } | null {
  const m = text.match(new RegExp(FINANCIAL_RE.source, 'g'));
  if (!m || !m[0]) return null;
  const idx = text.indexOf(m[0]);
  if (idx < 0) return null;
  return {
    text: m[0],
    rect: sliceRectForMatch(rect, text, idx, m[0].length),
  };
}

/**
 * Anchor-based extraction: label bbox ∪ value to the right OR next line below.
 */
function extractAnchors(lines: LineGroup[], out: ThreatItem[]) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;

    for (const m of text.matchAll(new RegExp(INVOICE_ANCHOR_RE.source, 'gi'))) {
      const label = m[0];
      const idx = m.index ?? 0;
      const labelRect = sliceRectForMatch(line.rect, text, idx, label.length);

      let value = extractValueAfterLabel(line, idx, label.length);
      // Prefer amount on same line when this is a money anchor.
      if (isAmountAnchor(label)) {
        const sameLineAmt = firstAmountInText(
          text.slice(idx + label.length),
          // approximate: slice remaining text region
          sliceRectForMatch(
            line.rect,
            text,
            idx + label.length,
            Math.max(text.length - idx - label.length, 1),
          ),
        );
        if (sameLineAmt) value = sameLineAmt;
      }

      // Fall back to immediately-below next line on same page.
      if ((!value || !value.text) && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.pageIndex === line.pageIndex) {
          if (isAmountAnchor(label)) {
            value = firstAmountInText(next.text, next.rect) ?? {
              text: next.text,
              rect: next.rect,
            };
          } else if (isNameAnchor(label)) {
            value = { text: next.text, rect: next.rect };
          } else {
            value = firstAmountInText(next.text, next.rect) ?? {
              text: next.text,
              rect: next.rect,
            };
          }
        }
      }

      if (!value || !value.text.trim()) {
        // Still redact the label itself when it's a high-intent field.
        pushUnique(
          out,
          makeItem(
            isNameAnchor(label) ? 'invoice' : 'invoice',
            isNameAnchor(label) ? 'Name' : 'Total / Balance',
            label,
            line.pageIndex,
            labelRect,
            isNameAnchor(label) ? `Billed To: ${label}` : label,
          ),
        );
        continue;
      }

      const combined = unionRects(labelRect, value.rect);
      if (isNameAnchor(label)) {
        pushUnique(
          out,
          makeItem(
            'invoice',
            'Name',
            value.text,
            line.pageIndex,
            combined,
            `Billed To: ${value.text}`,
          ),
        );
      } else {
        const amount =
          firstAmountInText(value.text, value.rect)?.text ?? value.text;
        const displayLabel = /subtotal/i.test(label)
          ? 'Subtotal'
          : /vat|tax/i.test(label)
            ? label.replace(/\b\w/g, (c) => c.toUpperCase())
            : /balance due|amount due|payment due/i.test(label)
              ? 'Amount Due'
              : /price/i.test(label)
                ? 'Price'
                : 'Total';
        pushUnique(
          out,
          makeItem(
            'invoice',
            'Total / Balance',
            amount,
            line.pageIndex,
            combined,
            `${displayLabel}: ${amount}`,
          ),
        );
      }
    }

    for (const m of text.matchAll(new RegExp(BALANCE_ANCHOR_RE.source, 'gi'))) {
      const label = m[0];
      const idx = m.index ?? 0;
      // Skip if already covered as invoice "balance due".
      if (/balance due/i.test(text)) continue;
      const labelRect = sliceRectForMatch(line.rect, text, idx, label.length);
      let value =
        firstAmountInText(text.slice(idx + label.length), sliceRectForMatch(
          line.rect,
          text,
          idx + label.length,
          Math.max(text.length - idx - label.length, 1),
        )) ?? extractValueAfterLabel(line, idx, label.length);

      if ((!value || !value.text) && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.pageIndex === line.pageIndex) {
          value = firstAmountInText(next.text, next.rect);
        }
      }
      if (!value) continue;

      const ending = /closing|ending|available/i.test(label);
      pushUnique(
        out,
        makeItem(
          'banking',
          'Total / Balance',
          value.text,
          line.pageIndex,
          unionRects(labelRect, value.rect),
          ending ? `Ending Balance: ${value.text}` : `Balance: ${value.text}`,
        ),
      );
    }
  }
}

/**
 * Classify real PDF.js / Vision line tokens into Private Details.
 * Input tokens MUST already be UI-space (top-left origin) and bound real text.
 * If no token text matches a pattern, the result count is 0 — no phantom boxes.
 */
export function classifyTextTokens(tokens: TextToken[]): ThreatItem[] {
  const out: ThreatItem[] = [];
  const lines = buildLineGroups(tokens);

  // 1) Anchor-based invoice / statement extraction (label + adjacent value).
  extractAnchors(lines, out);

  // 2) Line-level regex for standalone amounts, accounts, contacts, addresses.
  for (const line of lines) {
    const token: TextToken = {
      text: line.text,
      pageIndex: line.pageIndex,
      rect: line.rect,
    };
    if (line.text.length < 2) continue;

    matchCategory(
      'invoice',
      FINANCIAL_RE,
      token,
      out,
      () => 'Total / Balance',
      undefined,
      (m) => `Total: ${m}`,
    );

    matchCategory(
      'banking',
      ACCOUNT_RE,
      token,
      out,
      accountBadge,
      (m) => {
        const digits = m.replace(/\D/g, '');
        if (isFourDigitYear(digits)) return false;
        if (digits.length < 8 || digits.length > 20) return false;
        if (digits.length >= 13 && digits.length <= 19) return luhnOk(digits);
        return true;
      },
    );

    matchCategory(
      'banking',
      IBAN_RE,
      token,
      out,
      () => 'IBAN',
    );

    matchCategory(
      'contact',
      PHONE_RE,
      token,
      out,
      () => 'Phone Number',
      (m) => {
        const digits = m.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) return false;
        if (/^\d+$/.test(m.trim())) return false;
        if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
          return false;
        }
        return true;
      },
    );

    matchCategory('contact', EMAIL_RE, token, out, () => 'Email');

    matchCategory(
      'invoice',
      ADDRESS_RE,
      token,
      out,
      () => 'Address',
      undefined,
      (m) => `Address: ${m.trim()}`,
    );

    matchCategory(
      'identity',
      IDENTITY_RE,
      token,
      out,
      () => 'ID Number',
    );
  }

  // 3) Union near-adjacent same-line boxes so we never draw floating crumbs.
  return mergeSameLineThreats(out).sort(
    (a, b) =>
      a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
}

/**
 * Merge threat boxes that sit on the same line with a tiny X-gap
 * (4px Y / 12px X) when they share category+badge — cleaner blackout bars.
 */
function mergeSameLineThreats(items: ThreatItem[]): ThreatItem[] {
  if (items.length <= 1) return items;
  const yTol = 4 / 792;
  const xGap = 12 / 612;
  const sorted = [...items].sort(
    (a, b) =>
      a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
  const out: ThreatItem[] = [];

  for (const item of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.pageIndex === item.pageIndex &&
      prev.category === item.category &&
      prev.badge === item.badge &&
      Math.abs(
        prev.rect.y + prev.rect.height / 2 - (item.rect.y + item.rect.height / 2),
      ) <= yTol
    ) {
      const gap =
        Math.max(prev.rect.x, item.rect.x) -
        Math.min(prev.rect.x + prev.rect.width, item.rect.x + item.rect.width);
      if (gap <= xGap) {
        prev.rect = pad(unionRects(prev.rect, item.rect), 0, 0);
        if (!prev.text.includes(item.text)) {
          prev.text = `${prev.text} ${item.text}`.trim();
        }
        continue;
      }
    }
    out.push({ ...item, rect: { ...item.rect } });
  }
  return out;
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
