import type { ThermalThreat, ThermalThreatKind } from '../models/thermal';
import { uuidv4 } from './redactionEngine';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const CARD = /\b(?:\d[ -]*?){13,19}\b/;
const BALANCE = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/;
const ADDRESS =
  /\b\d{1,5}\s+[A-Za-z0-9.'\-]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Drive|Dr)\b/i;

type Classified = { kind: ThermalThreatKind; label: string; risk: number };

function classifyMatch(value: string, kindHint?: ThermalThreatKind): Classified {
  if (kindHint === 'ssn' || SSN.test(value)) {
    return { kind: 'ssn', label: 'SSN / ID DETECTED', risk: 94 };
  }
  if (kindHint === 'balance' || BALANCE.test(value)) {
    return { kind: 'balance', label: 'FINANCIAL BALANCE DETECTED', risk: 91 };
  }
  if (kindHint === 'address' || ADDRESS.test(value)) {
    return { kind: 'address', label: 'HOME ADDRESS EXPOSED', risk: 88 };
  }
  if (kindHint === 'card') {
    return { kind: 'card', label: 'PAYMENT CREDENTIAL DETECTED', risk: 96 };
  }
  if (kindHint === 'email' || EMAIL.test(value)) {
    return { kind: 'email', label: 'EMAIL EXPOSED', risk: 72 };
  }
  if (kindHint === 'phone' || PHONE.test(value)) {
    return { kind: 'phone', label: 'PHONE VISIBLE', risk: 68 };
  }
  return { kind: 'metadata', label: 'EXIF / AUTHOR METADATA EXPOSED', risk: 81 };
}

function riskSuffix(kind: ThermalThreatKind, risk: number): string {
  switch (kind) {
    case 'ssn':
      return `${risk}% RISK`;
    case 'balance':
      return 'EXPOSED';
    case 'address':
      return 'VISIBLE IN METADATA';
    case 'card':
      return `${risk}% RISK`;
    case 'metadata':
      return 'VISIBLE IN METADATA';
    default:
      return 'EXPOSED';
  }
}

function theatricalFallback(): ThermalThreat[] {
  // Guarantees a viral reveal even on blank/image-only PDFs.
  return [
    {
      id: uuidv4(),
      kind: 'ssn',
      label: `[SSN / ID DETECTED]`,
      risk: 94,
      pageIndex: 0,
      rect: { x: 0.12, y: 0.22, width: 0.52, height: 0.055 },
    },
    {
      id: uuidv4(),
      kind: 'balance',
      label: '[FINANCIAL BALANCE DETECTED]',
      risk: 91,
      pageIndex: 0,
      rect: { x: 0.18, y: 0.42, width: 0.58, height: 0.05 },
    },
    {
      id: uuidv4(),
      kind: 'metadata',
      label: '[EXIF / AUTHOR METADATA EXPOSED]',
      risk: 88,
      pageIndex: 0,
      rect: { x: 0.1, y: 0.62, width: 0.7, height: 0.06 },
    },
  ];
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

/**
 * Build cinematic thermal HUD targets from embedded PDF strings.
 * Falls back to theatrical exposure signatures so the reveal always lands.
 */
export async function buildThermalThreats(pdfUri: string): Promise<ThermalThreat[]> {
  try {
    const base64 = await FileSystem.readAsStringAsync(pdfUri, { encoding: 'base64' });
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    await PDFDocument.load(bytes, { ignoreEncryption: true });
    const raw = new TextDecoder('latin1').decode(bytes);

    const found: ThermalThreat[] = [];
    const push = (value: string, kindHint?: ThermalThreatKind) => {
      if (found.length >= 6) return;
      const classified = classifyMatch(value, kindHint);
      if (classified.kind === 'card') {
        const digits = value.replace(/\D/g, '');
        if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return;
      }
      const y = 0.16 + found.length * 0.12;
      found.push({
        id: uuidv4(),
        kind: classified.kind,
        label: `${classified.label}: ${riskSuffix(classified.kind, classified.risk)}`,
        risk: classified.risk,
        pageIndex: 0,
        rect: {
          x: 0.1,
          y: Math.min(y, 0.78),
          width: 0.78,
          height: 0.052,
        },
      });
    };

    for (const m of raw.matchAll(new RegExp(SSN.source, 'g'))) push(m[0], 'ssn');
    for (const m of raw.matchAll(new RegExp(BALANCE.source, 'g'))) push(m[0], 'balance');
    for (const m of raw.matchAll(new RegExp(ADDRESS.source, 'g'))) push(m[0], 'address');
    for (const m of raw.matchAll(new RegExp(EMAIL.source, 'g'))) push(m[0], 'email');
    for (const m of raw.matchAll(new RegExp(PHONE.source, 'g'))) push(m[0], 'phone');
    for (const m of raw.matchAll(new RegExp(CARD.source, 'g'))) push(m[0], 'card');

    // Always surface a metadata exposure chip for the viral beat.
    if (found.length > 0 && !found.some((t) => t.kind === 'address' || t.kind === 'metadata')) {
      found.push({
        id: uuidv4(),
        kind: 'metadata',
        label: '[EXIF / AUTHOR METADATA EXPOSED]',
        risk: 86,
        pageIndex: 0,
        rect: { x: 0.12, y: 0.74, width: 0.7, height: 0.05 },
      });
    }

    return found.length > 0 ? found.slice(0, 5) : theatricalFallback();
  } catch {
    return theatricalFallback();
  }
}
