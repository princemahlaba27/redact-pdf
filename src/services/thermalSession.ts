import { create } from 'zustand';

import type { RedactionRect } from '../models/redaction';

type ThermalSessionState = {
  pendingRedactions: RedactionRect[];
  seedFromBurn: (rects: RedactionRect[]) => void;
  consumePending: () => RedactionRect[];
};

/** Bridge: thermal burn → editor canvas seeds. */
export const useThermalSession = create<ThermalSessionState>((set, get) => ({
  pendingRedactions: [],

  seedFromBurn: (rects) => set({ pendingRedactions: rects }),

  consumePending: () => {
    const next = get().pendingRedactions;
    set({ pendingRedactions: [] });
    return next;
  },
}));
