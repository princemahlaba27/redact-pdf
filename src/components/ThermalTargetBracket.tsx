import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import type { ThermalThreat } from '../models/thermal';

type Props = {
  threat: ThermalThreat;
  visible: boolean;
  burning: boolean;
  canvasW: number;
  canvasH: number;
};

const BRACKET = 14;
const STROKE = 2;

/** Red targeting brackets + risk label for the thermal HUD. */
export function ThermalTargetBracket({
  threat,
  visible,
  burning,
  canvasW,
  canvasH,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1.08)).current;
  const burnFill = useRef(new Animated.Value(0)).current;
  const sizzle = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity, scale]);

  useEffect(() => {
    if (!burning) return;
    Animated.sequence([
      Animated.parallel([
        Animated.timing(burnFill, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(sizzle, { toValue: 0.92, duration: 70, useNativeDriver: true }),
          Animated.timing(sizzle, { toValue: 1.02, duration: 70, useNativeDriver: true }),
          Animated.timing(sizzle, { toValue: 0.96, duration: 70, useNativeDriver: true }),
          Animated.timing(sizzle, { toValue: 1, duration: 90, useNativeDriver: true }),
        ]),
      ]),
      Animated.timing(scale, { toValue: 0.97, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [burning, burnFill, sizzle, scale]);

  if (!visible && !burning) return null;

  const left = threat.rect.x * canvasW;
  const top = threat.rect.y * canvasH;
  const width = threat.rect.width * canvasW;
  const height = threat.rect.height * canvasH;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          left,
          top,
          width,
          height,
          opacity,
          transform: [{ scale: Animated.multiply(scale, sizzle) }],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            opacity: burnFill,
          },
        ]}
      />

      {/* Corner brackets */}
      <View style={[styles.corner, styles.tl]} />
      <View style={[styles.corner, styles.tr]} />
      <View style={[styles.corner, styles.bl]} />
      <View style={[styles.corner, styles.br]} />

      <View style={styles.labelChip}>
        <Text style={styles.labelText} numberOfLines={1}>
          {threat.label}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  corner: {
    position: 'absolute',
    width: BRACKET,
    height: BRACKET,
    borderColor: '#FF3B30',
  },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: STROKE,
    borderLeftWidth: STROKE,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: STROKE,
    borderRightWidth: STROKE,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: STROKE,
    borderLeftWidth: STROKE,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: STROKE,
    borderRightWidth: STROKE,
  },
  labelChip: {
    position: 'absolute',
    top: -22,
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 59, 48, 0.92)',
  },
  labelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
