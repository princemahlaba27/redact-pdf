import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { ThermalTargetBracket } from '../src/components/ThermalTargetBracket';
import { ScreenBackground } from '../src/components/ui';
import type { ThermalThreat } from '../src/models/thermal';
import { THERMAL_SCAN_MS, threatToRedaction } from '../src/models/thermal';
import { Haptic } from '../src/services/haptics';
import { buildThermalThreats } from '../src/services/thermalScan';
import { useThermalSession } from '../src/services/thermalSession';
import { AppleDS, typography } from '../src/theme/tokens';

type Phase = 'loading' | 'scanning' | 'armed' | 'burning' | 'shredded';

/**
 * TikTok-native Thermal Vulnerability Scan.
 * Laser sweep → auto-target HUD → Execute Deep Sanitization → editor.
 */
export default function ThermalScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri: string; title: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : params.title;

  const seedFromBurn = useThermalSession((s) => s.seedFromBurn);

  const [phase, setPhase] = useState<Phase>('loading');
  const [threats, setThreats] = useState<ThermalThreat[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [canvas, setCanvas] = useState({ width: 1, height: 1 });

  const laserY = useRef(new Animated.Value(0)).current;
  const laserOpacity = useRef(new Animated.Value(0)).current;
  const shredOpacity = useRef(new Animated.Value(0)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;

  const goEditor = useCallback(() => {
    router.replace({
      pathname: '/editor',
      params: { uri: uri || '', title: title || 'Evidence' },
    });
  }, [router, uri, title]);

  const skipToEditor = async () => {
    await Haptic.selection();
    goEditor();
  };

  useEffect(() => {
    if (!uri) {
      router.back();
      return;
    }
    let cancelled = false;
    void (async () => {
      const found = await buildThermalThreats(uri);
      if (cancelled) return;
      setThreats(found);
      setPhase('scanning');
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, router]);

  // Laser sweep + progressive target lock (~3s).
  useEffect(() => {
    if (phase !== 'scanning' || canvas.height < 8) return;

    laserOpacity.setValue(1);
    laserY.setValue(0);
    setRevealed(new Set());

    const sorted = [...threats].sort((a, b) => a.rect.y - b.rect.y);
    const timers: ReturnType<typeof setTimeout>[] = [];

    Animated.timing(laserY, {
      toValue: 1,
      duration: THERMAL_SCAN_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      Animated.timing(laserOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      setPhase('armed');
      Animated.timing(ctaOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
      void Haptic.warning();
    });

    for (const threat of sorted) {
      const delay = Math.max(120, threat.rect.y * THERMAL_SCAN_MS);
      timers.push(
        setTimeout(() => {
          setRevealed((prev) => {
            if (prev.has(threat.id)) return prev;
            const next = new Set(prev);
            next.add(threat.id);
            return next;
          });
          void Haptic.medium();
        }, delay),
      );
    }

    return () => {
      timers.forEach(clearTimeout);
      laserY.stopAnimation();
    };
  }, [phase, threats, canvas.height, laserY, laserOpacity, ctaOpacity]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ width, height });
  };

  const executeBurn = async () => {
    if (phase !== 'armed') return;
    await Haptic.heavy();
    setPhase('burning');
    Animated.timing(ctaOpacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();

    threats.forEach((_, i) => {
      setTimeout(() => {
        void Haptic.heavy();
      }, 90 + i * 110);
    });

    setTimeout(() => {
      seedFromBurn(threats.map(threatToRedaction));
      setPhase('shredded');
      Animated.timing(shredOpacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start();
      void Haptic.success();
    }, 780);

    setTimeout(() => {
      goEditor();
    }, 2100);
  };

  const pdfSource = useMemo(() => {
    if (!uri) return { uri: '' };
    if (Platform.OS === 'android') return { uri };
    return {
      html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>html,body{margin:0;height:100%;background:#0D0D0E}</style></head>
        <body><embed src="${uri}" type="application/pdf" width="100%" height="100%" /></body></html>`,
    };
  }, [uri]);

  const laserTranslate = laserY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(canvas.height - 4, 0)],
  });

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.topBar}>
          <Text style={styles.modeLabel}>THERMAL VULNERABILITY SCAN</Text>
          <Pressable onPress={() => void skipToEditor()} hitSlop={12}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <View style={styles.stage} onLayout={onLayout}>
          {uri ? (
            <WebView
              originWhitelist={['*']}
              allowFileAccess
              allowUniversalAccessFromFileURLs
              style={styles.webview}
              source={pdfSource}
              pointerEvents="none"
            />
          ) : null}

          <View style={styles.heatVeil} pointerEvents="none" />

          {phase === 'scanning' || phase === 'armed' || phase === 'burning' ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.laser,
                {
                  opacity: laserOpacity,
                  transform: [{ translateY: laserTranslate }],
                },
              ]}
            >
              <View style={styles.laserCore} />
              <View style={styles.laserBloom} />
            </Animated.View>
          ) : null}

          {threats.map((t) => (
            <ThermalTargetBracket
              key={t.id}
              threat={t}
              visible={revealed.has(t.id)}
              burning={phase === 'burning' || phase === 'shredded'}
              canvasW={canvas.width}
              canvasH={canvas.height}
            />
          ))}

          {phase === 'shredded' ? (
            <Animated.View style={[styles.shredBanner, { opacity: shredOpacity }]}>
              <Text style={styles.shredTitle}>Metadata Shredded.</Text>
              <Text style={styles.shredSub}>0 Bytes Recoverable.</Text>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.footer}>
          {phase === 'scanning' || phase === 'loading' ? (
            <Text style={styles.status}>
              {phase === 'loading' ? 'Arming thermal optics…' : 'Exposure scan in progress…'}
            </Text>
          ) : null}

          {phase === 'armed' || phase === 'burning' ? (
            <Animated.View style={{ opacity: ctaOpacity, width: '100%' }}>
              <Pressable
                onPress={() => void executeBurn()}
                disabled={phase !== 'armed'}
                style={({ pressed }) => [
                  styles.executeBtn,
                  pressed && { opacity: 0.9 },
                  phase !== 'armed' && { opacity: 0.55 },
                ]}
              >
                <Text style={styles.executeText}>Execute Deep Sanitization</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {phase === 'shredded' ? (
            <Text style={styles.status}>Opening destruction canvas…</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#E8A23A',
  },
  skip: {
    ...typography.captionMedium,
    color: AppleDS.labelTertiary,
  },
  stage: {
    flex: 1,
    marginHorizontal: 10,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: AppleDS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,162,58,0.28)',
  },
  webview: { flex: 1, backgroundColor: AppleDS.surface },
  heatVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 140, 40, 0.05)',
  },
  laser: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
  },
  laserCore: {
    height: 2,
    marginTop: 1,
    backgroundColor: '#7CFF6B',
  },
  laserBloom: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -6,
    height: 16,
    backgroundColor: 'rgba(124, 255, 107, 0.18)',
  },
  shredBanner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 24,
  },
  shredTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  shredSub: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: AppleDS.success,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    ...typography.footnoteMedium,
    color: AppleDS.labelSecondary,
  },
  executeBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
  },
  executeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
