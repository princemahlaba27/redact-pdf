import { create } from 'zustand';

import type { OcrSnapLine, TextToken } from '../models/threat';
import { tokensToSnapLines } from './threatClassifier';

type OcrSessionState = {
  /** Vision / image-pipeline tokens waiting to seed the editor. */
  pendingTokens: TextToken[];
  /** Line geometry for the text-snap highlighter brush. */
  pendingLines: OcrSnapLine[];
  /** true when the open document came from photos (not a digital PDF). */
  fromImages: boolean;
  seedFromImages: (tokens: TextToken[]) => void;
  consumePending: () => {
    tokens: TextToken[];
    lines: OcrSnapLine[];
    fromImages: boolean;
  };
  clear: () => void;
};

/**
 * Bridge: photo/camera Vision OCR → editor checklist + canvas + snap lines.
 * Digital PDFs leave this empty and rely on pdf.js getTextContent instead.
 */
export const useOcrSession = create<OcrSessionState>((set, get) => ({
  pendingTokens: [],
  pendingLines: [],
  fromImages: false,

  seedFromImages: (tokens) =>
    set({
      pendingTokens: tokens,
      pendingLines: tokensToSnapLines(tokens),
      fromImages: true,
    }),

  consumePending: () => {
    const { pendingTokens, pendingLines, fromImages } = get();
    set({ pendingTokens: [], pendingLines: [], fromImages: false });
    return { tokens: pendingTokens, lines: pendingLines, fromImages };
  },

  clear: () => set({ pendingTokens: [], pendingLines: [], fromImages: false }),
}));
