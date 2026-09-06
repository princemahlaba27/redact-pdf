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

type VisionOcrNative = NativeModule & {
  recognizeText(uri: string): Promise<VisionRawBox[]>;
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
