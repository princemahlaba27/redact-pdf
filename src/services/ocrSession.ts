import { create } from 'zustand';

import type { TextToken } from '../models/threat';

type OcrSessionState = {
  /** Vision / image-pipeline tokens waiting to seed the editor. */
  pendingTokens: TextToken[];
  /** true when the open document came from photos (not a digital PDF). */
  fromImages: boolean;
  seedFromImages: (tokens: TextToken[]) => void;
  consumePending: () => { tokens: TextToken[]; fromImages: boolean };
  clear: () => void;
};

/**
 * Bridge: photo/camera Vision OCR → editor checklist + canvas.
 * Digital PDFs leave this empty and rely on pdf.js getTextContent instead.
 */
export const useOcrSession = create<OcrSessionState>((set, get) => ({
  pendingTokens: [],
  fromImages: false,

  seedFromImages: (tokens) =>
    set({ pendingTokens: tokens, fromImages: true }),

  consumePending: () => {
    const { pendingTokens, fromImages } = get();
    set({ pendingTokens: [], fromImages: false });
    return { tokens: pendingTokens, fromImages };
  },

  clear: () => set({ pendingTokens: [], fromImages: false }),
}));
