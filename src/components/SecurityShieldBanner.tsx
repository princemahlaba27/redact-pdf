import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleDS, typography } from '../theme/tokens';

const MESSAGE =
  "🛡️ Security Shield Active: Screenshots are disabled to protect unredacted sensitive data. Tap 'Export' to generate a sanitized file.";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

/** High-contrast privacy toast when a screenshot attempt is detected. */
export function SecurityShieldBanner({ visible, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    translateY.setValue(-12);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(onDismiss, 5200);
    return () => clearTimeout(timer);
  }, [visible, onDismiss, opacity, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 10,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable onPress={onDismiss} style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={22} color={AppleDS.success} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Security Shield Active</Text>
          <Text style={styles.body}>{MESSAGE}</Text>
        </View>
        <Ionicons name="close" size={18} color={AppleDS.labelTertiary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: AppleDS.radius.md,
    backgroundColor: '#101014',
    borderWidth: 1,
    borderColor: 'rgba(51,214,107,0.32)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppleDS.successMuted,
  },
  copy: { flex: 1 },
  title: {
    ...typography.headline,
    fontSize: 15,
    marginBottom: 4,
  },
  body: {
    ...typography.footnote,
    color: AppleDS.labelSecondary,
    lineHeight: 18,
  },
});
