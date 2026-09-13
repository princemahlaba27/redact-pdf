import { create } from 'zustand';

type PendingExportState = {
  /** True when Export was tapped but gated behind the paywall. */
  pending: boolean;
  queueExport: () => void;
  /** Returns true once if an export was queued, then clears the flag. */
  consumePending: () => boolean;
  clear: () => void;
};

/**
 * Bridges editor → paywall → editor so a successful purchase auto-runs export
 * without requiring a second tap (post-value unlock).
 */
export const usePendingExport = create<PendingExportState>((set, get) => ({
  pending: false,
  queueExport: () => set({ pending: true }),
  consumePending: () => {
    const wasPending = get().pending;
    if (wasPending) set({ pending: false });
    return wasPending;
  },
  clear: () => set({ pending: false }),
}));
