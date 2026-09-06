import { create } from 'zustand';

import type { RedactionRect } from '../models/redaction';

type ThermalSessionState = {
  pendingRedactions: RedactionRect[];
  /** @deprecated Mock thermal seeding removed — always a no-op. */
  seedFromBurn: (_rects: RedactionRect[]) => void;
  /** @deprecated Always returns [] — never invents blackout boxes. */
  consumePending: () => RedactionRect[];
};

/**
 * Legacy bridge stub. Theatrical thermal burns no longer seed the editor.
 * Real boxes come only from pdf.js token extraction + classifyTextTokens.
 */
export const useThermalSession = create<ThermalSessionState>((set) => ({
  pendingRedactions: [],
  seedFromBurn: () => set({ pendingRedactions: [] }),
  consumePending: () => {
    set({ pendingRedactions: [] });
    return [];
  },
}));
