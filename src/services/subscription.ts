import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { create } from 'zustand';

const KEY = 'redactpdf_is_subscribed';
/** RevenueCat entitlement that unlocks export. */
export const PRO_ENTITLEMENT_ID = 'pro_access';
/** iOS public SDK key (App Store). */
export const REVENUECAT_IOS_API_KEY = 'appl_dftDRaxKMVEuYoBRaBfSmWSOhBl';

export type OfferSku = 'intro_7day' | 'extended_14day';

type SubscriptionState = {
  isSubscribed: boolean;
  isLoading: boolean;
  hydrated: boolean;
  lastOffer: OfferSku | null;
  hydrate: () => Promise<void>;
  requestExportAccess: () => Promise<boolean>;
  /** Primary: $0.49 for 7 days → $9.99/week */
  purchaseIntroductoryOffer: () => Promise<boolean>;
  /** Exit downsell: $0.00 for 14 days → $9.99/week (no price cut) */
  purchaseExtendedTrial: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
};

let purchasesConfigured = false;

function hasProAccess(customerInfo: {
  entitlements: { active: Record<string, unknown> };
}): boolean {
  return !!customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];
}

async function persistLocalUnlock(subscribed: boolean) {
  if (subscribed) {
    await AsyncStorage.setItem(KEY, 'true');
  } else {
    await AsyncStorage.removeItem(KEY);
  }
}

/**
 * Configure RevenueCat once on iOS. Safe to call repeatedly.
 */
export async function configureRevenueCat(): Promise<void> {
  if (Platform.OS !== 'ios' || purchasesConfigured) return;
  try {
    await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });
    purchasesConfigured = true;
  } catch (error) {
    console.error('[RevenueCat] configure failed:', error);
  }
}

async function refreshEntitlement(
  set: (partial: Partial<SubscriptionState>) => void,
): Promise<boolean> {
  if (Platform.OS !== 'ios' || !purchasesConfigured) {
    const raw = await AsyncStorage.getItem(KEY);
    const subscribed = raw === 'true';
    set({ isSubscribed: subscribed });
    return subscribed;
  }
  try {
    const info = await Purchases.getCustomerInfo();
    const subscribed = hasProAccess(info);
    await persistLocalUnlock(subscribed);
    set({ isSubscribed: subscribed });
    return subscribed;
  } catch (error) {
    console.error('[RevenueCat] getCustomerInfo failed:', error);
    const raw = await AsyncStorage.getItem(KEY);
    const subscribed = raw === 'true';
    set({ isSubscribed: subscribed });
    return subscribed;
  }
}

function pickWeeklyPackage(offerings: Awaited<
  ReturnType<typeof Purchases.getOfferings>
>): PurchasesPackage | null {
  const current = offerings.current;
  if (!current) return null;
  if (current.weekly) return current.weekly;
  // Fallback: first package whose product period looks weekly / $id contains week.
  const byId = current.availablePackages.find((p) =>
    /week|intro|trial|pro/i.test(p.identifier + p.product.identifier),
  );
  return byId ?? current.availablePackages[0] ?? null;
}

function isUserCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { userCancelled?: boolean; code?: number | string };
  if (e.userCancelled) return true;
  // PurchasesErrorCode.PurchaseCancelledError === 1
  return e.code === 1 || e.code === '1' || e.code === 'PURCHASE_CANCELLED';
}

async function purchaseWeekly(
  set: (partial: Partial<SubscriptionState>) => void,
  offer: OfferSku,
): Promise<boolean> {
  set({ isLoading: true });
  try {
    await configureRevenueCat();
    if (Platform.OS !== 'ios') {
      // Non-iOS builds: keep local unlock so Expo web/Android QA still works.
      await persistLocalUnlock(true);
      set({ isSubscribed: true, lastOffer: offer });
      return true;
    }

    const offerings = await Purchases.getOfferings();
    const weekly = pickWeeklyPackage(offerings);
    if (!weekly) {
      console.error('[RevenueCat] No weekly/current package in offerings');
      return false;
    }

    const { customerInfo } = await Purchases.purchasePackage(weekly);
    if (hasProAccess(customerInfo)) {
      await persistLocalUnlock(true);
      set({ isSubscribed: true, lastOffer: offer });
      return true;
    }
    return false;
  } catch (error: unknown) {
    if (!isUserCancelled(error)) {
      console.error('Purchase error:', error);
    }
    return false;
  } finally {
    set({ isLoading: false });
  }
}

/**
 * Export paywall gate backed by RevenueCat (`pro_access` entitlement).
 */
export const useSubscription = create<SubscriptionState>((set, get) => ({
  isSubscribed: false,
  isLoading: false,
  hydrated: false,
  lastOffer: null,

  hydrate: async () => {
    await configureRevenueCat();
    await refreshEntitlement(set);
    set({ hydrated: true });
  },

  requestExportAccess: async () => {
    if (get().isSubscribed) return true;
    return refreshEntitlement(set);
  },

  purchaseIntroductoryOffer: async () => purchaseWeekly(set, 'intro_7day'),

  purchaseExtendedTrial: async () => purchaseWeekly(set, 'extended_14day'),

  restorePurchases: async () => {
    set({ isLoading: true });
    try {
      await configureRevenueCat();
      if (Platform.OS !== 'ios') {
        const raw = await AsyncStorage.getItem(KEY);
        const subscribed = raw === 'true';
        set({ isSubscribed: subscribed });
        return subscribed;
      }
      const customerInfo = await Purchases.restorePurchases();
      const subscribed = hasProAccess(customerInfo);
      await persistLocalUnlock(subscribed);
      set({ isSubscribed: subscribed });
      return subscribed;
    } catch (error) {
      console.error('[RevenueCat] restore failed:', error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
}));
