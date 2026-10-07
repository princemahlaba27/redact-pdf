import { NativeModule, requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** Raw Vision / ML Kit observation (bottom-left normalized on iOS). */
export type VisionRawBox = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** true when y is Vision bottom-left; false when already top-left (Android). */
  visionOrigin: boolean;
};

export type VisionEntityBox = VisionRawBox & {
  category: string;
  badge: string;
};

export type VisionDocumentPage = {
  pageIndex: number;
  tokens: VisionRawBox[];
  entities: VisionEntityBox[];
};

type VisionOcrNative = NativeModule & {
  recognizeText(uri: string): Promise<VisionRawBox[]>;
  recognizeDocument(uri: string): Promise<{ pages: VisionDocumentPage[] }>;
  flattenPdf(
    uri: string,
    rects: Array<{
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }>,
  ): Promise<string>;
  isAvailable(): boolean;
};

let native: VisionOcrNative | null = null;

function getNative(): VisionOcrNative | null {
  if (native) return native;
  try {
    native = requireNativeModule<VisionOcrNative>('VisionOcr');
    return native;
  } catch {
    return null;
  }
}

/** Whether a native OCR engine is linked into this binary. */
export function isVisionOcrAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    const mod = getNative();
    return !!mod?.isAvailable?.();
  } catch {
    return false;
  }
}

/**
 * Run on-device OCR on a local image file URI.
 * iOS → VNRecognizeTextRequest (.accurate + language correction)
 * Android → ML Kit text recognition (best-effort when linked)
 */
export async function recognizeTextNative(uri: string): Promise<VisionRawBox[]> {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'Vision OCR native module is not available. Use a development build.',
    );
  }
  const results = await mod.recognizeText(uri);
  return Array.isArray(results) ? results : [];
}

/** OCR a PDF or image entirely on-device. Empty when the native module is absent. */
export async function recognizeDocumentNative(uri: string): Promise<VisionDocumentPage[]> {
  const mod = getNative();
  if (!mod?.recognizeDocument) return [];
  const result = await mod.recognizeDocument(uri);
  return Array.isArray(result?.pages) ? result.pages : [];
}

/** Destructive raster flatten. Rejects when the native module cannot write a PDF. */
export async function flattenPdfNative(
  uri: string,
  rects: Array<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>,
): Promise<string> {
  const mod = getNative();
  if (!mod?.flattenPdf) {
    throw new Error('On-device flatten is not available.');
  }
  return mod.flattenPdf(uri, rects);
}
