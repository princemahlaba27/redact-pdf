import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'redactpdf_is_subscribed';

export type OfferSku = 'intro_7day' | 'extended_14day';

type SubscriptionState = {
  isSubscribed: boolean;
  isLoading: boolean;
  hydrated: boolean;
  lastOffer: OfferSku | null;
  hydrate: () => Promise<void>;
  requestExportAccess: () => Promise<boolean>;
  /** Primary: $0.49 for 7 days → $9.99/week */
  purchaseIntroductoryOffer: () => Promise<void>;
  /** Exit downsell: $0.00 for 14 days → $9.99/week (no price cut) */
  purchaseExtendedTrial: () => Promise<void>;
  restorePurchases: () => Promise<void>;
};

async function unlock(set: (partial: Partial<SubscriptionState>) => void, offer: OfferSku) {
  set({ isLoading: true });
  try {
    // TODO: Wire RevenueCat / Superwall / native IAP SKUs here.
    await new Promise((r) => setTimeout(r, 650));
    await AsyncStorage.setItem(KEY, 'true');
    set({ isSubscribed: true, lastOffer: offer });
  } finally {
    set({ isLoading: false });
  }
}

/**
 * Export paywall gate.
 * Local unlock for QA; replace with RevenueCat / Superwall / Play Billing for production.
 */
export const useSubscription = create<SubscriptionState>((set, get) => ({
  isSubscribed: false,
  isLoading: false,
  hydrated: false,
  lastOffer: null,

  hydrate: async () => {
    const raw = await AsyncStorage.getItem(KEY);
    set({ isSubscribed: raw === 'true', hydrated: true });
  },

  requestExportAccess: async () => get().isSubscribed,

  purchaseIntroductoryOffer: async () => unlock(set, 'intro_7day'),

  purchaseExtendedTrial: async () => unlock(set, 'extended_14day'),

  restorePurchases: async () => {
    set({ isLoading: true });
    try {
      await new Promise((r) => setTimeout(r, 400));
      const raw = await AsyncStorage.getItem(KEY);
      if (raw === 'true') set({ isSubscribed: true });
    } finally {
      set({ isLoading: false });
    }
  },
}));
