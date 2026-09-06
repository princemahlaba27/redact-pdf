import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  PricingCard,
  PrimaryButton,
  ScreenBackground,
  SectionCard,
  ValuePropRow,
} from '../src/components/ui';
import { Haptic } from '../src/services/haptics';
import { useSubscription } from '../src/services/subscription';
import { AppleDS, typography } from '../src/theme/tokens';

export default function PaywallScreen() {
  const router = useRouter();
  const { isLoading, purchaseIntroductoryOffer, restorePurchases } =
    useSubscription();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [glow]);

  const shadowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.35],
  });

  const onPurchase = async () => {
    await Haptic.medium();
    await purchaseIntroductoryOffer();
    await Haptic.success();
    router.back();
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.closeRow}>
            <Pressable
              onPress={() => {
                void Haptic.selection();
                router.back();
              }}
              hitSlop={12}
            >
              <Ionicons name="close-circle" size={28} color={AppleDS.labelQuaternary} />
            </Pressable>
          </View>

          <Animated.View style={[styles.heroIcon, { shadowOpacity }]}>
            <Ionicons name="shield-checkmark" size={56} color={AppleDS.accent} />
          </Animated.View>

          <Text style={[typography.title, { textAlign: 'center', marginTop: 16 }]}>
            RedactPDF Audit Shield
          </Text>
          <Text
            style={[
              typography.subheadline,
              { textAlign: 'center', marginTop: 8, marginHorizontal: 12 },
            ]}
          >
            Zero-trace pixel destruction with forensic metadata wipe on every export.
          </Text>

          <View style={{ height: 28 }} />
          <SectionCard>
            <ValuePropRow
              icon="flame-outline"
              text="Unlimited burn-and-flatten PDF exports"
            />
            <ValuePropRow
              icon="scan-outline"
              text="On-device threat scan (SSN, balances, IDs)"
            />
            <ValuePropRow
              icon="hardware-chip-outline"
              text="EXIF / Author / Revisions wiped before share"
            />
          </SectionCard>

          <View style={{ height: 20 }} />
          <PricingCard
            title="Introductory Offer: $0.49 for 7 Days"
            subtitle="Then $9.99/week recurring. Cancel anytime."
          />

          <View style={{ height: 20 }} />
          <PrimaryButton
            title="Start 7-Day Access - $0.49"
            onPress={() => void onPurchase()}
            loading={isLoading}
          />

          <View style={styles.links}>
            <Pressable onPress={() => void restorePurchases()}>
              <Text style={typography.caption}>Restore Purchases</Text>
            </Pressable>
            <Text style={typography.caption}>•</Text>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync('https://redactpdf.app/terms')
              }
            >
              <Text style={typography.caption}>Terms</Text>
            </Pressable>
            <Text style={typography.caption}>•</Text>
            <Pressable
              onPress={() =>
                void Linking.openURL('https://redactpdf.app/privacy')
              }
            >
              <Text style={typography.caption}>Privacy Policy</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  closeRow: { alignItems: 'flex-end', paddingTop: 8 },
  heroIcon: {
    alignSelf: 'center',
    marginTop: 8,
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,133,255,0.08)',
    shadowColor: AppleDS.accent,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  links: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
});
