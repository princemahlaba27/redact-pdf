import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';

import type { NormalizedRect, RedactionRect, RedactionStyle } from '../models/redaction';

/**
 * Copy a picked/external PDF into the app cache before rendering or reading.
 * iOS security-scoped bookmarks often return an empty stream if accessed
 * directly from external storage / Files app URIs.
 */
export async function cachePdfUri(sourceUri: string): Promise<string> {
  const targetPath = `${FileSystem.cacheDirectory}active_render.pdf`;
  const info = await FileSystem.getInfoAsync(targetPath);
  if (info.exists) {
    await FileSystem.deleteAsync(targetPath, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: sourceUri, to: targetPath });
  return targetPath;
}

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const CARD = /\b(?:\d[ -]*?){13,19}\b/;

export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function luhn(digits: string): boolean {
  let sum = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    let d = parseInt(reversed[i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function containsPii(text: string): boolean {
  if (SSN.test(text) || EMAIL.test(text) || PHONE.test(text)) return true;
  for (const match of text.matchAll(new RegExp(CARD.source, 'g'))) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return false;
}

export function detectPiiInLines(
  lines: { text: string; rect: NormalizedRect }[],
  pageIndex: number,
  style: RedactionStyle,
): RedactionRect[] {
  const out: RedactionRect[] = [];
  for (const line of lines) {
    if (!containsPii(line.text)) continue;
    out.push({
      id: uuidv4(),
      pageIndex,
      rect: padRect(line.rect, 0.004, 0.002),
      style,
    });
  }
  return mergeOverlapping(out);
}

function padRect(r: NormalizedRect, dx: number, dy: number): NormalizedRect {
  return {
    x: Math.max(0, r.x - dx),
    y: Math.max(0, r.y - dy),
    width: Math.min(1 - Math.max(0, r.x - dx), r.width + dx * 2),
    height: Math.min(1 - Math.max(0, r.y - dy), r.height + dy * 2),
  };
}

function mergeOverlapping(items: RedactionRect[]): RedactionRect[] {
  if (items.length === 0) return [];
  let merged = [...items];
  let changed = true;
  while (changed) {
    changed = false;
    const result: RedactionRect[] = [];
    const used = new Set<number>();
    for (let i = 0; i < merged.length; i++) {
      if (used.has(i)) continue;
      let cur = { ...merged[i], rect: { ...merged[i].rect } };
      for (let j = i + 1; j < merged.length; j++) {
        if (used.has(j)) continue;
        if (cur.pageIndex !== merged[j].pageIndex) continue;
        if (rectsOverlap(cur.rect, merged[j].rect)) {
          cur.rect = unionRect(cur.rect, merged[j].rect);
          used.add(j);
          changed = true;
        }
      }
      result.push(cur);
    }
    merged = result;
  }
  return merged;
}

function rectsOverlap(a: NormalizedRect, b: NormalizedRect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function unionRect(a: NormalizedRect, b: NormalizedRect): NormalizedRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * @deprecated Fake-coordinate heuristic removed.
 * Use PdfPageViewer token extraction + classifyTextTokens instead.
 * Kept as a no-op so older call sites fail closed (no mock boxes).
 */
export async function detectPiiInPdf(
  _pdfUri: string,
  _pageIndex: number,
  _style: RedactionStyle,
): Promise<RedactionRect[]> {
  return [];
}

export async function readPdfBytes(uri: string): Promise<Uint8Array> {
  const base64 = await readPdfAsBase64(uri);
  return base64ToBytes(base64);
}

/** Base64 PDF payload for offline WebView / pdf.js canvas rendering. */
export async function readPdfAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}

/** Burns opaque redaction fills into the PDF and strips document metadata. */
export async function burnAndFlatten(
  pdfUri: string,
  redactions: RedactionRect[],
): Promise<string> {
  const bytes = await readPdfBytes(pdfUri);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  for (const redaction of redactions) {
    const page = pages[redaction.pageIndex];
    if (!page) continue;
    applyRedaction(page, redaction);
  }

  doc.setTitle('Redacted Document');
  doc.setAuthor('RedactPDF');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('RedactPDF');
  doc.setCreator('RedactPDF');

  const out = await doc.save({ useObjectStreams: false });
  const outUri = `${FileSystem.cacheDirectory}RedactPDF_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(outUri, bytesToBase64(out), {
    encoding: 'base64',
  });
  return outUri;
}

function applyRedaction(page: PDFPage, redaction: RedactionRect) {
  const { width, height } = page.getSize();
  const r = redaction.rect;
  const x = r.x * width;
  const w = r.width * width;
  const h = r.height * height;
  const y = height - r.y * height - h;

  if (redaction.style === 'blur') {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(0.55, 0.55, 0.55),
      opacity: 1,
      borderWidth: 0,
    });
    page.drawRectangle({
      x: x + 2,
      y: y + 2,
      width: Math.max(1, w - 4),
      height: Math.max(1, h - 4),
      color: rgb(0.35, 0.35, 0.35),
      opacity: 0.85,
      borderWidth: 0,
    });
    return;
  }

  const color = redaction.style === 'white' ? rgb(1, 1, 1) : rgb(0, 0, 0);
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color,
    borderWidth: 0,
    opacity: 1,
  });
}

/**
 * Build a PDF from image URIs. Images are normalized upright via
 * expo-image-manipulator so EXIF orientation never flips the page.
 */
export async function imagesToPdf(imageUris: string[]): Promise<string> {
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  const doc = await PDFDocument.create();
  for (const uri of imageUris) {
    // Force upright pixels — strips EXIF orientation ambiguity.
    const fixed = await manipulateAsync(uri, [], {
      compress: 0.92,
      format: SaveFormat.JPEG,
    });
    const base64 = await FileSystem.readAsStringAsync(fixed.uri, {
      encoding: 'base64',
    });
    const imgBytes = base64ToBytes(base64);
    const image = await doc.embedJpg(imgBytes);
    const pageW = image.width;
    const pageH = image.height;
    const page = doc.addPage([pageW, pageH]);
    page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  }
  const out = await doc.save();
  const outUri = `${FileSystem.cacheDirectory}Scan_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(outUri, bytesToBase64(out), {
    encoding: 'base64',
  });
  return outUri;
}

/** Rebuild a PDF from burned JPEG page rasters (true pixel flatten). */
export async function burnedPagesToPdf(
  pages: { base64: string; width: number; height: number }[],
): Promise<string> {
  const doc = await PDFDocument.create();
  for (const pageData of pages) {
    const imgBytes = base64ToBytes(pageData.base64);
    const image = await doc.embedJpg(imgBytes);
    const pageW = pageData.width || image.width;
    const pageH = pageData.height || image.height;
    const page = doc.addPage([pageW, pageH]);
    page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  }
  doc.setTitle('Redacted Document');
  doc.setAuthor('RedactPDF');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('RedactPDF');
  doc.setCreator('RedactPDF');
  const out = await doc.save({ useObjectStreams: false });
  const outUri = `${FileSystem.cacheDirectory}RedactPDF_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(outUri, bytesToBase64(out), {
    encoding: 'base64',
  });
  return outUri;
}

export async function getPdfPageCount(pdfUri: string): Promise<number> {
  const bytes = await readPdfBytes(pdfUri);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}
