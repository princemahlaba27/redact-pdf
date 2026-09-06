import * as FileSystem from 'expo-file-system/legacy';
import {
  manipulateAsync,
  SaveFormat,
} from 'expo-image-manipulator';

/**
 * Normalize a camera/gallery image for on-device OCR:
 * - Convert HEIC / raw camera buffers to JPEG
 * - Bake EXIF orientation into upright pixels
 * - Cache under FileSystem.cacheDirectory
 */
export async function normalizeImageForOcr(
  sourceUri: string,
  index = 0,
): Promise<string> {
  // Empty transforms still re-encode — expo-image-manipulator applies EXIF
  // orientation when writing, so the pixel buffer's top-left matches visual top-left.
  const fixed = await manipulateAsync(sourceUri, [], {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });

  const dest = `${FileSystem.cacheDirectory}ocr_page_${Date.now()}_${index}.jpg`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }

  // Prefer move when source is already in cache; fall back to copy.
  try {
    await FileSystem.moveAsync({ from: fixed.uri, to: dest });
  } catch {
    await FileSystem.copyAsync({ from: fixed.uri, to: dest });
  }

  return dest;
}

/** Normalize a batch of gallery/camera URIs into upright JPEGs. */
export async function normalizeImagesForOcr(
  sourceUris: string[],
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < sourceUris.length; i++) {
    out.push(await normalizeImageForOcr(sourceUris[i], i));
  }
  return out;
}
