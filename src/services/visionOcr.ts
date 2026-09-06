import type { TextToken } from '../models/threat';
import {
  isVisionOcrAvailable,
  recognizeTextNative,
  type VisionRawBox,
} from '../../modules/vision-ocr';

export type VisionLine = {
  text: string;
  /** Normalized UI rect (top-left origin, 0–1). */
  rect: { x: number; y: number; width: number; height: number };
};

/**
 * Convert a Vision bottom-left box into top-left UI coordinates:
 *   rectTop  = 1 - (box.y + box.height)
 *   rectLeft = box.x
 */
export function visionBoxToUiRect(box: VisionRawBox): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const width = Math.min(Math.max(box.width, 0), 1);
  const height = Math.min(Math.max(box.height, 0), 1);
  const x = Math.min(Math.max(box.x, 0), 1 - width);

  const y = box.visionOrigin
    ? 1 - (box.y + box.height)
    : box.y;

  return {
    x,
    y: Math.min(Math.max(y, 0), 1 - height),
    width: Math.max(width, 0.004),
    height: Math.max(height, 0.008),
  };
}

/**
 * Run Apple Vision (iOS) / native OCR on a preprocessed upright JPEG.
 * Returns UI-space line tokens ready for the regex classifier.
 */
export async function recognizeImageText(
  imageUri: string,
  pageIndex: number,
): Promise<TextToken[]> {
  if (!isVisionOcrAvailable()) {
    console.warn(
      '[visionOcr] Native Vision module unavailable — image OCR skipped. Use a development build for photo detection.',
    );
    return [];
  }

  const raw = await recognizeTextNative(imageUri);
  const tokens: TextToken[] = [];

  for (const box of raw) {
    const text = String(box.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue;
    const rect = visionBoxToUiRect(box);
    if (rect.width < 0.004 || rect.height < 0.004) continue;
    tokens.push({ text, pageIndex, rect });
  }

  // Cluster nearby observations into reading-order lines for better regex spans.
  return clusterIntoLines(tokens, pageIndex);
}

function clusterIntoLines(tokens: TextToken[], pageIndex: number): TextToken[] {
  if (tokens.length === 0) return [];

  const sorted = [...tokens].sort(
    (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
  const lines: { midY: number; parts: TextToken[] }[] = [];

  for (const token of sorted) {
    const midY = token.rect.y + token.rect.height / 2;
    let line = lines.find(
      (L) => Math.abs(L.midY - midY) < Math.max(token.rect.height * 0.7, 0.012),
    );
    if (!line) {
      line = { midY, parts: [] };
      lines.push(line);
    }
    line.parts.push(token);
  }

  const out: TextToken[] = [];
  for (const line of lines) {
    line.parts.sort((a, b) => a.rect.x - b.rect.x);
    const text = line.parts
      .map((p) => p.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const x0 = Math.min(...line.parts.map((p) => p.rect.x));
    const y0 = Math.min(...line.parts.map((p) => p.rect.y));
    const x1 = Math.max(...line.parts.map((p) => p.rect.x + p.rect.width));
    const y1 = Math.max(...line.parts.map((p) => p.rect.y + p.rect.height));
    out.push({
      text,
      pageIndex,
      rect: {
        x: x0,
        y: y0,
        width: Math.max(x1 - x0, 0.01),
        height: Math.max(y1 - y0, 0.01),
      },
    });
  }
  return out;
}

/** OCR every normalized page image and tag tokens with pageIndex. */
export async function recognizeImagesText(
  imageUris: string[],
): Promise<TextToken[]> {
  const all: TextToken[] = [];
  for (let i = 0; i < imageUris.length; i++) {
    const pageTokens = await recognizeImageText(imageUris[i], i);
    all.push(...pageTokens);
  }
  return all;
}
