import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { AppleDS, typography } from '../theme/tokens';

export function ScreenBackground({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <View style={styles.badgeDot} />
      <Text style={typography.captionMedium}>{text}</Text>
    </View>
  );
}

export function ActionCard({
  icon,
  title,
  subtitle,
  isPrimary,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  isPrimary?: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.985, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
      }
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.card,
          isPrimary && styles.cardPrimary,
          { transform: [{ scale }] },
        ]}
      >
        <View style={[styles.iconBox, isPrimary && styles.iconBoxPrimary]}>
          <Ionicons
            name={icon}
            size={22}
            color={isPrimary ? AppleDS.accent : 'rgba(255,255,255,0.88)'}
          />
        </View>
        <View style={styles.cardText}>
          <Text style={typography.headline}>{title}</Text>
          <Text style={[typography.footnote, { marginTop: 4 }]}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={AppleDS.labelQuaternary} />
      </Animated.View>
    </Pressable>
  );
}

export function TrustBanner({ text }: { text: string }) {
  return (
    <View style={styles.trust}>
      <Ionicons name="shield-half-outline" size={16} color={AppleDS.success} />
      <Text style={[typography.footnoteMedium, { flex: 1, marginLeft: 10 }]}>
        {text}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.primaryBtn,
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[typography.headline, { color: '#fff' }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function FloatingToolbar({ children }: { children: React.ReactNode }) {
  return <View style={styles.toolbar}>{children}</View>;
}

export function LoadingOverlay({ message }: { message: string }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.overlayCard}>
        <ActivityIndicator color="#fff" size="large" />
        <Text style={[typography.subheadline, { marginTop: 12 }]}>{message}</Text>
      </View>
    </View>
  );
}

export function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.section}>{children}</View>;
}

export function ValuePropRow({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.valueRow}>
      <Ionicons name="checkmark-circle" size={18} color={AppleDS.success} />
      <Ionicons name={icon} size={16} color={AppleDS.accent} style={{ marginLeft: 10 }} />
      <Text
        style={[
          typography.subheadline,
          { flex: 1, marginLeft: 10, color: 'rgba(255,255,255,0.88)', fontWeight: '500' },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function PricingCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.pricing}>
      <Text style={[typography.headline, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[typography.footnote, { textAlign: 'center', marginTop: 8 }]}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppleDS.canvas,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separatorOpaque,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: AppleDS.success,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: AppleDS.layout.cardPadding,
    borderRadius: AppleDS.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: AppleDS.separatorOpaque,
    gap: 16,
  },
  cardPrimary: {
    backgroundColor: 'rgba(10,133,255,0.12)',
    borderColor: 'rgba(10,133,255,0.35)',
  },
  iconBox: {
    width: AppleDS.layout.iconSize,
    height: AppleDS.layout.iconSize,
    borderRadius: AppleDS.radius.icon,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxPrimary: {
    backgroundColor: AppleDS.accentMuted,
  },
  cardText: { flex: 1 },
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(51,214,107,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separatorOpaque,
  },
  primaryBtn: {
    height: AppleDS.layout.minTouch + 6,
    borderRadius: AppleDS.radius.md,
    backgroundColor: AppleDS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 100,
    backgroundColor: 'rgba(28,28,30,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separatorOpaque,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  overlayCard: {
    padding: 28,
    borderRadius: AppleDS.radius.md,
    backgroundColor: AppleDS.surfaceGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separatorOpaque,
    alignItems: 'center',
  },
  section: {
    padding: AppleDS.spacing.lg,
    borderRadius: AppleDS.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separatorOpaque,
    gap: 16,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center' },
  pricing: {
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: AppleDS.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(10,133,255,0.55)',
  },
});
