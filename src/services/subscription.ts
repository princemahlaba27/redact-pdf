import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'redactpdf_is_subscribed';

type SubscriptionState = {
  isSubscribed: boolean;
  isLoading: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  requestExportAccess: () => Promise<boolean>;
  purchaseIntroductoryOffer: () => Promise<void>;
  restorePurchases: () => Promise<void>;
};

/**
 * Export paywall gate.
 * Local unlock for QA; replace with RevenueCat / Superwall / Play Billing for production.
 */
export const useSubscription = create<SubscriptionState>((set, get) => ({
  isSubscribed: false,
  isLoading: false,
  hydrated: false,

  hydrate: async () => {
    const raw = await AsyncStorage.getItem(KEY);
    set({ isSubscribed: raw === 'true', hydrated: true });
  },

  requestExportAccess: async () => get().isSubscribed,

  purchaseIntroductoryOffer: async () => {
    set({ isLoading: true });
    try {
      // TODO: Wire RevenueCat / Superwall / native IAP here.
      await new Promise((r) => setTimeout(r, 600));
      await AsyncStorage.setItem(KEY, 'true');
      set({ isSubscribed: true });
    } finally {
      set({ isLoading: false });
    }
  },

  restorePurchases: async () => {
    set({ isLoading: true });
    try {
      await new Promise((r) => setTimeout(r, 400));
    } finally {
      set({ isLoading: false });
    }
  },
}));
