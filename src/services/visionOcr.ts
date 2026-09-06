import type { TextToken } from '../models/threat';
import {
  isVisionOcrAvailable,
  recognizeTextNative,
  type VisionRawBox,
} from '../../modules/vision-ocr';
import { unionAdjacentWordRects } from './threatClassifier';

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
 * Returns UI-space word tokens (already Y-flipped) ready for anchor classifiers.
 * Nearby words on the same line are also merged into clean line tokens.
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
  const words: TextToken[] = [];

  for (const box of raw) {
    const text = String(box.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 1) continue;
    const rect = visionBoxToUiRect(box);
    if (rect.width < 0.002 || rect.height < 0.002) continue;
    words.push({ text, pageIndex, rect });
  }

  // Keep word tokens for anchor adjacency, plus merged line tokens for regex spans.
  const lines = clusterIntoLines(words, pageIndex);
  // Prefer returning both: classifiers group by mid-Y anyway; word+line improves coverage.
  return mergeWordAndLineTokens(words, lines);
}

function mergeWordAndLineTokens(
  words: TextToken[],
  lines: TextToken[],
): TextToken[] {
  // Dedupe identical text+rect keys; keep all unique geometry.
  const out: TextToken[] = [];
  const keys = new Set<string>();
  for (const t of [...words, ...lines]) {
    const key = `${t.pageIndex}|${t.text.toLowerCase()}|${t.rect.x.toFixed(3)}|${t.rect.y.toFixed(3)}|${t.rect.width.toFixed(3)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(t);
  }
  return out;
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
    // Union adjacent words (≤4px Y / <12px X) into a clean horizontal bar —
    // never leave floating crumbs over empty whitespace.
    const united = unionAdjacentWordRects(line.parts.map((p) => p.rect));
    const text = line.parts
      .map((p) => p.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const rect =
      united.length === 1
        ? united[0]
        : united.length > 1
          ? {
              x: Math.min(...united.map((r) => r.x)),
              y: Math.min(...united.map((r) => r.y)),
              width:
                Math.max(...united.map((r) => r.x + r.width)) -
                Math.min(...united.map((r) => r.x)),
              height:
                Math.max(...united.map((r) => r.y + r.height)) -
                Math.min(...united.map((r) => r.y)),
            }
          : {
              x: Math.min(...line.parts.map((p) => p.rect.x)),
              y: Math.min(...line.parts.map((p) => p.rect.y)),
              width:
                Math.max(...line.parts.map((p) => p.rect.x + p.rect.width)) -
                Math.min(...line.parts.map((p) => p.rect.x)),
              height:
                Math.max(...line.parts.map((p) => p.rect.y + p.rect.height)) -
                Math.min(...line.parts.map((p) => p.rect.y)),
            };
    out.push({
      text,
      pageIndex,
      rect: {
        x: rect.x,
        y: rect.y,
        width: Math.max(rect.width, 0.01),
        height: Math.max(rect.height, 0.01),
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
