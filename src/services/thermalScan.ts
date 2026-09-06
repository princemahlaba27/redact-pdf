/**
 * @deprecated Theatrical / heuristic "thermal" scanning has been removed.
 * Real private-detail detection now happens exclusively via PdfPageViewer
 * (pdf.js getTextContent) → classifyTextTokens on exact glyph bounds.
 *
 * This module remains only as a safe no-op so any leftover imports compile
 * without inventing blackout boxes on blank margins.
 */
import type { ThermalThreat } from '../models/thermal';

/** Always returns [] — never invents coordinates or mock threats. */
export async function buildThermalThreats(_pdfUri: string): Promise<ThermalThreat[]> {
  return [];
}
