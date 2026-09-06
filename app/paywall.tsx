import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton, ScreenBackground } from '../src/components/ui';
import { Haptic } from '../src/services/haptics';
import { useSubscription } from '../src/services/subscription';
import { AppleDS, typography } from '../src/theme/tokens';

const BENEFITS = [
  'Permanent blackout (text cannot be highlighted, copied, or revealed)',
  'Removes hidden document history and author information',
  'Unlimited exports to Files, Print, and Mail',
] as const;

function BenefitRow({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const rawTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const documentName = (rawTitle?.trim() || 'Untitled document').replace(
    /\.pdf$/i,
    '',
  );
  const displayDoc = `${documentName}.pdf`;

  const {
    isLoading,
    purchaseIntroductoryOffer,
    purchaseExtendedTrial,
    restorePurchases,
  } = useSubscription();

  const [showDownsell, setShowDownsell] = useState(false);
  const [downsellOffered, setDownsellOffered] = useState(false);

  const finishAndReturn = useCallback(() => {
    router.back();
  }, [router]);

  const onPrimaryPurchase = async () => {
    await Haptic.medium();
    await purchaseIntroductoryOffer();
    await Haptic.success();
    finishAndReturn();
  };

  const onExtendedPurchase = async () => {
    await Haptic.medium();
    await purchaseExtendedTrial();
    await Haptic.success();
    setShowDownsell(false);
    finishAndReturn();
  };

  const onClosePress = async () => {
    await Haptic.selection();
    if (!downsellOffered) {
      setDownsellOffered(true);
      setShowDownsell(true);
      return;
    }
    setShowDownsell(false);
    finishAndReturn();
  };

  const dismissDownsellHard = async () => {
    await Haptic.selection();
    setShowDownsell(false);
    finishAndReturn();
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.closeRow}>
            <Pressable
              onPress={() => void onClosePress()}
              hitSlop={14}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={AppleDS.labelTertiary} />
            </Pressable>
          </View>

          <View style={styles.lockGlyph}>
            <View style={styles.lockRing}>
              <Ionicons
                name="lock-closed"
                size={42}
                color={AppleDS.labelPrimary}
              />
            </View>
          </View>

          <Text style={styles.headline}>Permanently Black Out & Export</Text>
          <Text style={styles.docLine} numberOfLines={4}>
            The blacked-out areas will be burned into the document so they can
            never be uncovered.
          </Text>
          <Text style={[styles.docLine, { marginTop: 6 }]} numberOfLines={1}>
            {displayDoc}
          </Text>

          <View style={styles.benefitCard}>
            {BENEFITS.map((b) => (
              <BenefitRow key={b} text={b} />
            ))}
          </View>

          <View style={styles.offerCard}>
            <Text style={styles.offerTitle}>7 Days Full Access for $0.49</Text>
            <Text style={styles.offerPrice}>
              Renews at $9.99/week. Cancel anytime in Apple Settings.
            </Text>
          </View>

          <PrimaryButton
            title="Black Out & Save Document"
            onPress={() => void onPrimaryPurchase()}
            loading={isLoading && !showDownsell}
            style={styles.cta}
          />

          <View style={styles.links}>
            <Pressable onPress={() => void restorePurchases()}>
              <Text style={styles.link}>Restore Purchases</Text>
            </Pressable>
            <Text style={styles.linkDot}>•</Text>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync('https://redactpdf.app/terms')
              }
            >
              <Text style={styles.link}>Terms</Text>
            </Pressable>
            <Text style={styles.linkDot}>•</Text>
            <Pressable
              onPress={() =>
                void Linking.openURL('https://redactpdf.app/privacy')
              }
            >
              <Text style={styles.link}>Privacy</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={showDownsell}
        animationType="slide"
        transparent
        onRequestClose={() => void dismissDownsellHard()}
      >
        <View style={styles.downsellBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => void dismissDownsellHard()}
          />
          <SafeAreaView edges={['bottom']} style={styles.downsellSheet}>
            <View style={styles.downsellHandle} />
            <Pressable
              style={styles.downsellClose}
              onPress={() => void dismissDownsellHard()}
              hitSlop={12}
            >
              <Ionicons name="close" size={20} color={AppleDS.labelTertiary} />
            </Pressable>

            <Text style={styles.downsellHeadline}>Need More Time?</Text>
            <Text style={styles.downsellBody}>
              Evaluate for 14 days at no charge today.
            </Text>

            <View style={styles.extendedCard}>
              <Text style={styles.offerTitle}>14-Day Free Evaluation</Text>
              <Text style={styles.extendedPrice}>$0.00 today</Text>
              <Text style={styles.extendedFine}>
                Then $9.99/week. Cancel anytime in Apple Settings.
              </Text>
            </View>

            <PrimaryButton
              title="Start 14-Day Free Evaluation"
              onPress={() => void onExtendedPurchase()}
              loading={isLoading}
              style={styles.downsellCta}
            />
            <Pressable
              onPress={() => void dismissDownsellHard()}
              style={styles.decline}
            >
              <Text style={styles.declineText}>Not now</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    flexGrow: 1,
  },
  closeRow: {
    alignItems: 'flex-end',
    paddingTop: 4,
    minHeight: 36,
  },
  lockGlyph: {
    alignSelf: 'center',
    marginTop: 12,
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headline: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: AppleDS.labelPrimary,
  },
  docLine: {
    marginTop: 10,
    textAlign: 'center',
    ...typography.subheadline,
    color: AppleDS.labelSecondary,
    paddingHorizontal: 8,
  },
  benefitCard: {
    marginTop: 28,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: AppleDS.radius.md,
    backgroundColor: AppleDS.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separator,
    gap: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  check: {
    fontSize: 16,
    fontWeight: '700',
    color: AppleDS.success,
    lineHeight: 22,
    width: 18,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
  },
  offerCard: {
    marginTop: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: AppleDS.radius.md,
    backgroundColor: AppleDS.surfaceElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(10,132,255,0.5)',
  },
  offerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppleDS.labelPrimary,
    letterSpacing: -0.2,
  },
  offerPrice: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '500',
    color: AppleDS.labelSecondary,
    lineHeight: 21,
  },
  cta: { marginTop: 22 },
  downsellCta: {
    marginTop: 16,
    marginHorizontal: 16,
    alignSelf: 'stretch',
  },
  links: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  link: {
    ...typography.caption,
    color: AppleDS.labelTertiary,
  },
  linkDot: {
    ...typography.caption,
    color: AppleDS.labelQuaternary,
  },
  downsellBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  downsellSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separator,
    alignItems: 'center',
  },
  downsellHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 8,
  },
  downsellClose: {
    position: 'absolute',
    right: 18,
    top: 16,
    zIndex: 2,
  },
  downsellHeadline: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: AppleDS.labelPrimary,
    paddingHorizontal: 8,
  },
  downsellBody: {
    marginTop: 10,
    textAlign: 'center',
    ...typography.subheadline,
    lineHeight: 21,
    paddingHorizontal: 4,
  },
  extendedCard: {
    alignSelf: 'stretch',
    marginTop: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: AppleDS.radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separator,
  },
  extendedPrice: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '700',
    color: AppleDS.labelPrimary,
  },
  extendedFine: {
    marginTop: 8,
    ...typography.footnote,
    lineHeight: 18,
  },
  decline: {
    marginTop: 16,
    paddingVertical: 10,
  },
  declineText: {
    ...typography.captionMedium,
    color: AppleDS.labelTertiary,
    textAlign: 'center',
  },
});
