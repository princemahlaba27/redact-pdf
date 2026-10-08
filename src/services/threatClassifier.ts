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

/** Currency amounts, accounting negatives, and decimal money. Skips bare IDs. */
export const MONEY_RE =
  /(?:[\$€£]\s*|\bR\s*)-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?|\(\d{1,3}(?:[,\s]\d{3})*\.\d{2}\)|\b-?\d{1,3}(?:[,\s]\d{3})*\.\d{2}\b/g;

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

/** 9-digit ABA routing numbers (checksum applied by the caller). */
export const ROUTING_RE = /\b\d{9}\b/g;

/**
 * Tax / VAT / national ID labels with a value.
 * Allows "Vat: No: 010335-1338" and "Tax: 4470299720".
 */
export const TAX_ID_RE =
  /\b(?:ssn|sin|tin|vat|tax(?:\s*id)?|national\s*id|id\s*(?:no|number))\b(?:\s*[:.]?\s*(?:no|number|nr|id))?\s*[:.#-]?\s*([A-Z0-9][A-Z0-9\-/]{5,20})/gi;

/** Mixed reference / transaction ids such as 991a-988204634960. */
export const REFERENCE_RE =
  /\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]{3,}(?:-[A-Za-z0-9]{3,})+\b/g;

/** Passport labels. */
export const PASSPORT_RE = /\bpassport\b[:\s#-]*([A-Z0-9]{6,13})/gi;

/** Document classification banners. */
export const CLASSIFICATION_RE =
  /\b(?:confidential|privileged|do not disclose|proprietary)\b/gi;

/** Invoice / receipt anchor labels. VAT and tax IDs are matched separately. */
export const INVOICE_ANCHOR_RE =
  /(?:total|balance due|amount due|subtotal|billed to|invoice to|recipient|payment due|price)\b/gi;

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

/** ABA routing checksum. Rejects 000000000. */
export function abaOk(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  const d = digits.split('').map((c) => parseInt(c, 10));
  const sum =
    3 * (d[0] + d[3] + d[6]) +
    7 * (d[1] + d[4] + d[7]) +
    (d[2] + d[5] + d[8]);
  return sum !== 0 && sum % 10 === 0;
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

type ClaimedSpan = { start: number; end: number };

function overlapsSpan(spans: ClaimedSpan[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function matchLine(
  category: ThreatCategory,
  re: RegExp,
  line: LineGroup,
  out: ThreatItem[],
  badgeFor: (m: string) => ThreatBadge,
  claimed: ClaimedSpan[],
  filter?: (m: string) => boolean,
  displayFor?: (m: string) => string,
  valueOf?: (m: RegExpMatchArray) => string,
) {
  const text = line.text;
  if (!text.replace(/\s/g, '').length) return;

  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
    const value = (valueOf?.(m) ?? m[0]).trim();
    if (!value) continue;
    if (filter && !filter(value)) continue;
    const raw = m[0];
    const rawIndex = m.index ?? text.indexOf(raw);
    if (rawIndex < 0) continue;
    const local = raw.indexOf(value);
    const idx = local >= 0 ? rawIndex + local : rawIndex;
    const length = value.length;
    if (overlapsSpan(claimed, idx, idx + length)) continue;
    const rect = rectForSpan(line, idx, length);
    if (rect.width > 0.95 && rect.height > 0.08) continue;
    if (rect.height > 0.2) continue;
    claimed.push({ start: idx, end: idx + length });
    pushUnique(
      out,
      makeItem(
        category,
        badgeFor(value),
        value,
        line.pageIndex,
        rect,
        displayFor?.(value),
      ),
    );
  }
}

type LineSpan = {
  start: number;
  end: number;
  rect: NormalizedRect;
};

type LineGroup = {
  midY: number;
  pageIndex: number;
  parts: TextToken[];
  text: string;
  rect: NormalizedRect;
  spans: LineSpan[];
};

const NAME_STOP =
  /^(total|balance|invoice|statement|amount|paid|tax|vat|subtotal|page|date|receipt|debit|credit|description|transfer|reference|account|number|phone|email|address|qty|quantity|item|items|payment|due|from|to|the|and|no|id)$/i;

function isUsefulName(text: string): boolean {
  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, ''))
    .filter((word) => word.length > 1 && !NAME_STOP.test(word));
  return words.length >= 2 && words.length <= 6 && words.every((word) => /[A-Za-z]{2,}/.test(word));
}

/** Join word tokens, inserting a space only when the glyphs are not touching. */
function joinLineParts(parts: TextToken[]): { text: string; spans: LineSpan[] } {
  let text = '';
  const spans: LineSpan[] = [];
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i].text.replace(/\s+/g, ' ').trim();
    if (!piece) continue;
    if (text.length > 0) {
      const prev = parts[i - 1];
      const gap = parts[i].rect.x - (prev.rect.x + prev.rect.width);
      const tight = gap <= Math.max(prev.rect.height * 0.35, 0.006);
      text += tight ? '' : ' ';
    }
    const start = text.length;
    text += piece;
    spans.push({ start, end: text.length, rect: parts[i].rect });
  }
  return { text, spans };
}

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
      const joined = joinLineParts(g.parts);
      if (joined.text.length < 1) continue;
      const x0 = Math.min(...g.parts.map((p) => p.rect.x));
      const y0 = Math.min(...g.parts.map((p) => p.rect.y));
      const x1 = Math.max(...g.parts.map((p) => p.rect.x + p.rect.width));
      const y1 = Math.max(...g.parts.map((p) => p.rect.y + p.rect.height));
      lines.push({
        midY: g.midY,
        pageIndex,
        parts: g.parts,
        text: joined.text,
        spans: joined.spans,
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

/**
 * Box only the glyphs that the match covers. Table gaps stay untouched,
 * so an amount in the last column is not painted across the description.
 */
function rectForSpan(line: LineGroup, start: number, length: number): NormalizedRect {
  const end = start + Math.max(length, 1);
  if (line.spans.length > 1) {
    const hits = line.spans.filter((span) => span.end > start && span.start < end);
    if (hits.length > 0) {
      return hits.map((span) => span.rect).reduce((a, b) => unionRects(a, b));
    }
  }
  return sliceRectForMatch(line.rect, line.text, start, length);
}

function isNameAnchor(label: string): boolean {
  return /billed to|invoice to|recipient/i.test(label);
}

function isAmountAnchor(label: string): boolean {
  return /total|balance due|amount due|subtotal|payment due|price|balance|available funds/i.test(
    label,
  ) && !/\bvat\b|\btax\b/i.test(label);
}

function firstAmountInText(
  text: string,
  rect: NormalizedRect,
): { text: string; rect: NormalizedRect } | null {
  const m = text.match(new RegExp(MONEY_RE.source, 'g'));
  if (!m || !m[0]) return null;
  const idx = text.indexOf(m[0]);
  if (idx < 0) return null;
  return {
    text: m[0],
    rect: sliceRectForMatch(rect, text, idx, m[0].length),
  };
}

function amountOnLine(
  line: LineGroup,
  fromIndex = 0,
): { text: string; rect: NormalizedRect; index: number } | null {
  const slice = line.text.slice(fromIndex);
  const found = firstAmountInText(slice, line.rect);
  if (!found) return null;
  const index = fromIndex + slice.indexOf(found.text);
  if (index < fromIndex) return null;
  return { text: found.text, index, rect: rectForSpan(line, index, found.text.length) };
}

/**
 * Anchor-based extraction. Only the value glyphs are boxed — never the
 * rest of the line, and never a VAT/tax label mistaken for a balance.
 */
function extractAnchors(lines: LineGroup[], out: ThreatItem[]) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;

    for (const m of text.matchAll(new RegExp(INVOICE_ANCHOR_RE.source, 'gi'))) {
      const label = m[0];
      const idx = m.index ?? 0;

      if (isNameAnchor(label)) {
        const next = lines[i + 1];
        if (
          next &&
          next.pageIndex === line.pageIndex &&
          isUsefulName(next.text)
        ) {
          pushUnique(
            out,
            makeItem(
              'invoice',
              'Name',
              next.text.trim(),
              line.pageIndex,
              next.rect,
              `Billed To: ${next.text.trim()}`,
            ),
          );
        }
        continue;
      }

      if (!isAmountAnchor(label)) continue;
      const found = amountOnLine(line, idx + label.length) ?? (
        lines[i + 1] && lines[i + 1].pageIndex === line.pageIndex
          ? amountOnLine(lines[i + 1], 0)
          : null
      );
      if (!found) continue;
      const displayLabel = /subtotal/i.test(label)
        ? 'Subtotal'
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
          found.text,
          line.pageIndex,
          found.rect,
          `${displayLabel}: ${found.text}`,
        ),
      );
    }

    for (const m of text.matchAll(new RegExp(BALANCE_ANCHOR_RE.source, 'gi'))) {
      const label = m[0];
      const idx = m.index ?? 0;
      const found =
        amountOnLine(line, idx + label.length) ??
        (lines[i + 1] && lines[i + 1].pageIndex === line.pageIndex
          ? amountOnLine(lines[i + 1], 0)
          : null);
      if (!found) continue;
      const ending = /closing|ending|available/i.test(label);
      pushUnique(
        out,
        makeItem(
          'banking',
          'Total / Balance',
          found.text,
          line.pageIndex,
          found.rect,
          ending ? `Ending Balance: ${found.text}` : `Balance: ${found.text}`,
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

  // 2) Specific identifiers first so a VAT number or email is never
  //    swallowed by a nearby amount and labeled as a balance.
  for (const line of lines) {
    if (line.text.length < 2) continue;
    const claimed: ClaimedSpan[] = [];

    matchLine(
      'contact',
      EMAIL_RE,
      line,
      out,
      () => 'Email',
      claimed,
    );

    matchLine(
      'identity',
      TAX_ID_RE,
      line,
      out,
      () => 'Tax ID',
      claimed,
      undefined,
      undefined,
      (m) => (m[1] || m[0]).trim(),
    );

    matchLine(
      'identity',
      PASSPORT_RE,
      line,
      out,
      () => 'Passport',
      claimed,
      undefined,
      undefined,
      (m) => (m[1] || m[0]).trim(),
    );

    matchLine(
      'identity',
      IDENTITY_RE,
      line,
      out,
      () => 'ID Number',
      claimed,
    );

    matchLine(
      'identity',
      REFERENCE_RE,
      line,
      out,
      () => 'ID Number',
      claimed,
      (m) => m.replace(/-/g, '').length >= 12,
    );

    matchLine('banking', IBAN_RE, line, out, () => 'IBAN', claimed);

    matchLine(
      'contact',
      PHONE_RE,
      line,
      out,
      () => 'Phone Number',
      claimed,
      (m) => {
        const digits = m.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) return false;
        if (/^\d+$/.test(m.trim())) return false;
        if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) return false;
        return true;
      },
    );

    matchLine(
      'banking',
      ACCOUNT_RE,
      line,
      out,
      accountBadge,
      claimed,
      (m) => {
        const digits = m.replace(/\D/g, '');
        if (isFourDigitYear(digits)) return false;
        if (digits.length < 8 || digits.length > 20) return false;
        if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(m)) return false;
        if (digits.length >= 13 && digits.length <= 19) return luhnOk(digits);
        return true;
      },
    );

    matchLine(
      'banking',
      ROUTING_RE,
      line,
      out,
      () => 'Routing Number',
      claimed,
      (m) => abaOk(m),
    );

    matchLine(
      'contact',
      ADDRESS_RE,
      line,
      out,
      () => 'Address',
      claimed,
      undefined,
      (m) => `Address: ${m.trim()}`,
    );

    matchLine(
      'marker',
      CLASSIFICATION_RE,
      line,
      out,
      () => 'Classification',
      claimed,
    );

    matchLine(
      'invoice',
      MONEY_RE,
      line,
      out,
      () => 'Total / Balance',
      claimed,
      (m) => m.replace(/[^\d]/g, '').length >= 3,
      (m) => `Amount: ${m}`,
    );
  }

  // 3) Drop coarse boxes that swallowed a tighter, more specific hit.
  return dedupeThreats(mergeSameLineThreats(out)).sort(
    (a, b) =>
      a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
}

function intersectionArea(a: NormalizedRect, b: NormalizedRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

/** Intersection over union. 1 means the boxes occupy the same region. */
export function rectIoU(a: NormalizedRect, b: NormalizedRect): number {
  const inter = intersectionArea(a, b);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

const SPECIFIC_BADGES = new Set<ThreatBadge>([
  'Email',
  'Phone Number',
  'Tax ID',
  'Passport',
  'ID Number',
  'Card Number',
  'IBAN',
  'Address',
  'Routing Number',
  'Name',
]);

function sameTextAndBounds(a: ThreatItem, b: ThreatItem): boolean {
  if (a.pageIndex !== b.pageIndex) return false;
  if (a.text.trim().toLowerCase() !== b.text.trim().toLowerCase()) return false;
  return (
    Math.abs(a.rect.x - b.rect.x) < 0.02 &&
    Math.abs(a.rect.y - b.rect.y) < 0.02 &&
    Math.abs(a.rect.width - b.rect.width) < 0.02 &&
    Math.abs(a.rect.height - b.rect.height) < 0.02
  );
}

function duplicatesThreat(a: ThreatItem, b: ThreatItem): boolean {
  if (a.pageIndex !== b.pageIndex || a.id === b.id) return false;
  return rectIoU(a.rect, b.rect) > 0.6 || sameTextAndBounds(a, b);
}

function preferThreat(keep: ThreatItem, incoming: ThreatItem) {
  const keepSpecific = SPECIFIC_BADGES.has(keep.badge);
  const nextSpecific = SPECIFIC_BADGES.has(incoming.badge);
  const keepArea = keep.rect.width * keep.rect.height;
  const nextArea = incoming.rect.width * incoming.rect.height;
  const takeNext =
    (nextSpecific && !keepSpecific) ||
    (nextSpecific === keepSpecific && nextArea < keepArea);
  if (!takeNext) return;
  keep.rect = { ...incoming.rect };
  keep.text = incoming.text;
  keep.displayText = incoming.displayText;
  keep.badge = incoming.badge;
  keep.category = incoming.category;
}

/**
 * Non-maximum suppression. Boxes with IoU above 0.6, or the same text and
 * bounds, collapse into one. A specific badge wins over a coarse total.
 */
export function suppressDuplicateThreats(items: ThreatItem[]): ThreatItem[] {
  const kept: ThreatItem[] = [];
  for (const item of items) {
    const dup = kept.find((prev) => duplicatesThreat(prev, item));
    if (!dup) {
      kept.push({ ...item, rect: { ...item.rect } });
      continue;
    }
    preferThreat(dup, item);
  }
  return kept;
}

function dedupeThreats(items: ThreatItem[]): ThreatItem[] {
  return suppressDuplicateThreats(items);
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
      prev.badge !== 'Total / Balance' &&
      prev.badge !== 'Card Number' &&
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
