import { normalizeImagesForOcr } from './imagePreprocess';
import { useOcrSession } from './ocrSession';
import { imagesToPdf } from './redactionEngine';
import { recognizeImagesText } from './visionOcr';

export type ImagePipelineResult = {
  /** Flattened multi-page PDF built from upright JPEGs (for the editor canvas). */
  pdfUri: string;
  /** UI-space tokens from Apple Vision (may be empty if native module missing). */
  tokenCount: number;
};

/**
 * Two-pipeline entry for photos / screenshots / HEIC camera scans:
 * 1) Preprocess → upright JPEG
 * 2) Apple Vision OCR → regex-ready tokens (seeded into ocrSession)
 * 3) imagesToPdf → editor opens the same pages for burn/export
 */
export async function processImagesForRedaction(
  sourceUris: string[],
): Promise<ImagePipelineResult> {
  const normalized = await normalizeImagesForOcr(sourceUris);
  const tokens = await recognizeImagesText(normalized);
  useOcrSession.getState().seedFromImages(tokens);
  const pdfUri = await imagesToPdf(normalized);
  return { pdfUri, tokenCount: tokens.length };
}
