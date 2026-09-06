import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type Props = {
  active: boolean;
  width: number;
  height: number;
};

/**
 * Visible "burn" scanline that sweeps a draft destruction box while the user
 * drags — tactile cue that pixels are being flattened, not merely highlighted.
 */
export function BurnScanline({ active, width, height }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!active || height < 4) {
      loopRef.current?.stop();
      loopRef.current = null;
      progress.setValue(0);
      return;
    }

    progress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [active, height, progress]);

  if (!active || width < 2 || height < 2) return null;

  const travel = Math.max(height - 3, 0);
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.line,
          {
            width,
            transform: [{ translateY }],
          },
        ]}
      />
      <View style={[styles.edgeGlow, { width, height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 3,
    backgroundColor: 'rgba(255, 72, 42, 0.92)',
    shadowColor: '#FF482A',
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  edgeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255, 72, 42, 0.45)',
  },
});
