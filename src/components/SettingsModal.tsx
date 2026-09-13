import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Purchases from 'react-native-purchases';

import { PRO_ENTITLEMENT_ID } from '../services/subscription';

const PRIVACY_POLICY_URL =
  'https://wistful-pyramid-1b8.notion.site/Privacy-Policy-for-Redact-PDF-3d6d442b3e17807b9bf5d502338deb18?source=copy_link';
const APPLE_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const APPLE_SUBSCRIPTIONS_URL =
  'https://apps.apple.com/account/subscriptions';

type SettingsModalProps = {
  isVisible: boolean;
  onClose: () => void;
  onForceOpenPaywall: () => void;
};

/**
 * Apple-review Settings sheet — membership status, restore, legal links,
 * and a hidden 5-tap version trigger to force-open the paywall.
 */
export function SettingsModal({
  isVisible,
  onClose,
  onForceOpenPaywall,
}: SettingsModalProps) {
  const [isPro, setIsPro] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setDevTapCount(0);
      return;
    }
    void checkSubscriptionStatus();
  }, [isVisible]);

  const checkSubscriptionStatus = async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      setIsPro(!!customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]);
    } catch (e) {
      console.warn('Could not check subscription status:', e);
    }
  };

  const handleRestore = async () => {
    try {
      const customerInfo = await Purchases.restorePurchases();
      const active = !!customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];
      setIsPro(active);
      Alert.alert(
        active ? 'Success' : 'No Purchases Found',
        active
          ? 'Your Pro Access has been restored.'
          : 'No active subscription found for this Apple ID.',
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Restore failed.';
      Alert.alert('Restore Failed', message);
    }
  };

  const handleManageSubscription = () => {
    if (Platform.OS === 'ios') {
      void Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
    }
  };

  /** Hidden Dev Trigger: tap version label 5 times to force-open paywall. */
  const handleVersionTap = () => {
    const nextCount = devTapCount + 1;
    if (nextCount >= 5) {
      setDevTapCount(0);
      onClose();
      onForceOpenPaywall();
    } else {
      setDevTapCount(nextCount);
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.doneButton}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionHeader}>MEMBERSHIP</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Current Status</Text>
              <View
                style={[styles.badge, isPro ? styles.badgePro : styles.badgeFree]}
              >
                <Text style={styles.badgeText}>
                  {isPro ? 'Pro Active' : 'Free'}
                </Text>
              </View>
            </View>

            {isPro ? (
              <Pressable
                style={styles.actionRow}
                onPress={handleManageSubscription}
              >
                <Text style={styles.actionRowText}>
                  Manage Apple Subscription
                </Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onForceOpenPaywall();
                }}
              >
                <Text style={[styles.actionRowText, { color: '#007AFF' }]}>
                  Upgrade to Pro
                </Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}

            <Pressable style={styles.actionRowLast} onPress={() => void handleRestore()}>
              <Text style={styles.actionRowText}>Restore Purchases</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionHeader}>PRIVACY & LEGAL</Text>
          <View style={styles.card}>
            <Pressable
              style={styles.actionRow}
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            >
              <Text style={styles.actionRowText}>Privacy Policy</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
              style={styles.actionRowLast}
              onPress={() => void Linking.openURL(APPLE_EULA_URL)}
            >
              <Text style={styles.actionRowText}>Terms of Service (EULA)</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleVersionTap}
            style={styles.versionContainer}
          >
            <Text style={styles.versionText}>
              Redact PDF v1.0.0 (Build 11)
            </Text>
            <Text style={styles.subtext}>100% On-Device Processing</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0E' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  doneButton: { fontSize: 16, fontWeight: '600', color: '#007AFF' },
  content: { padding: 20 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  rowLabel: { fontSize: 16, color: '#FFF' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgePro: { backgroundColor: '#34C759' },
  badgeFree: { backgroundColor: '#3A3A3C' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  actionRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  actionRowText: { fontSize: 16, color: '#FFF' },
  chevron: { fontSize: 20, color: '#8E8E93', fontWeight: '400' },
  versionContainer: { alignItems: 'center', marginTop: 32 },
  versionText: { fontSize: 12, color: '#636366' },
  subtext: { fontSize: 11, color: '#48484A', marginTop: 4 },
});
