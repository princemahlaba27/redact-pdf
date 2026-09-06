import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BurnScanline } from '../src/components/BurnScanline';
import { PdfPageViewer } from '../src/components/PdfPageViewer';
import { SecurityShieldBanner } from '../src/components/SecurityShieldBanner';
import {
  FloatingToolbar,
  LoadingOverlay,
  ScreenBackground,
} from '../src/components/ui';
import { useScreenProtection } from '../src/hooks/useScreenProtection';
import type {
  NormalizedRect,
  RedactionMode,
  RedactionRect,
  RedactionStyle,
} from '../src/models/redaction';
import {
  REDACTION_MODE_LABEL,
  REDACTION_STYLE_COLOR,
  REDACTION_STYLE_LABEL,
} from '../src/models/redaction';
import { Haptic } from '../src/services/haptics';
import {
  burnAndFlatten,
  cachePdfUri,
  detectPiiInPdf,
  getPdfPageCount,
  uuidv4,
} from '../src/services/redactionEngine';
import { useSubscription } from '../src/services/subscription';
import { useThermalSession } from '../src/services/thermalSession';
import { AppleDS, typography } from '../src/theme/tokens';

function statusPillCopy(count: number): string {
  if (count <= 0) {
    return 'Sanitized: 0 Threats Neutralized • Metadata Wipe Armed';
  }
  const n = count === 1 ? '1 Threat Neutralized' : `${count} Threats Neutralized`;
  return `Sanitized: ${n} • Metadata Wiped`;
}

export default function EditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri: string; title: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : params.title;

  const { bannerVisible, dismissBanner } = useScreenProtection(true);
  const isSubscribed = useSubscription((s) => s.isSubscribed);
  const consumePending = useThermalSession((s) => s.consumePending);
  const pendingExport = useRef(false);

  const [renderUri, setRenderUri] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<RedactionMode>('manual');
  const [style, setStyle] = useState<RedactionStyle>('black');
  const [redactions, setRedactions] = useState<RedactionRect[]>([]);
  const seededRef = useRef(false);
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState<NormalizedRect | null>(null);
  const draftRef = useRef<NormalizedRect | null>(null);
  const lastBurnPulse = useRef(0);

  useEffect(() => {
    if (seededRef.current) return;
    const seeded = consumePending();
    if (seeded.length) {
      seededRef.current = true;
      setRedactions(seeded);
    }
  }, [consumePending]);

  useEffect(() => {
    if (!uri) {
      setLoadingDoc(false);
      return;
    }
    let cancelled = false;
    setLoadingDoc(true);
    void (async () => {
      try {
        const cached = await cachePdfUri(uri);
        if (cancelled) return;
        setRenderUri(cached);
        setPageCount(await getPdfPageCount(cached));
      } catch {
        if (!cancelled) {
          setRenderUri(uri);
          setPageCount(1);
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const pageRedactions = useMemo(
    () => redactions.filter((r) => r.pageIndex === pageIndex),
    [redactions, pageIndex],
  );

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const pulseBurnHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastBurnPulse.current < 120) return;
    lastBurnPulse.current = now;
    void Haptic.medium();
  }, []);

  const addRedaction = useCallback(
    (rect: NormalizedRect) => {
      if (rect.width < 0.01 || rect.height < 0.01) return;
      setRedactions((prev) => [
        ...prev,
        { id: uuidv4(), pageIndex, rect, style },
      ]);
      void Haptic.medium();
    },
    [pageIndex, style],
  );

  const beginDraft = (rect: NormalizedRect) => {
    draftRef.current = rect;
    setDraft(rect);
  };

  const updateDraft = (rect: NormalizedRect | null) => {
    draftRef.current = rect;
    setDraft(rect);
    if (rect && (rect.width > 0.012 || rect.height > 0.012)) {
      pulseBurnHaptic();
    }
  };

  const commitDraft = () => {
    const current = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (current) addRedaction(current);
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(mode === 'manual')
        .onBegin((e) => {
          'worklet';
          runOnJS(beginDraft)({
            x: e.x / canvasSize.width,
            y: e.y / canvasSize.height,
            width: 0,
            height: 0,
          });
        })
        .onUpdate((e) => {
          'worklet';
          const x1 = e.x / canvasSize.width;
          const y1 = e.y / canvasSize.height;
          const x0 = (e.x - e.translationX) / canvasSize.width;
          const y0 = (e.y - e.translationY) / canvasSize.height;
          runOnJS(updateDraft)({
            x: Math.min(x0, x1),
            y: Math.min(y0, y1),
            width: Math.abs(x1 - x0),
            height: Math.abs(y1 - y0),
          });
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitDraft)();
        }),
    [mode, canvasSize.width, canvasSize.height, addRedaction, pulseBurnHaptic],
  );

  const runSmart = async () => {
    if (!renderUri || detecting) return;
    setDetecting(true);
    try {
      const found = await detectPiiInPdf(renderUri, pageIndex, style);
      setRedactions((prev) => [...prev, ...found]);
      if (found.length) await Haptic.success();
      else await Haptic.warning();
    } catch {
      await Haptic.error();
    } finally {
      setDetecting(false);
    }
  };

  const onModeChange = async (next: RedactionMode) => {
    setMode(next);
    await Haptic.selection();
    if (next === 'smart') await runSmart();
  };

  const undo = async () => {
    setRedactions((prev) => prev.slice(0, -1));
    await Haptic.selection();
  };

  const doExport = useCallback(async () => {
    if (!renderUri) return;
    setExporting(true);
    try {
      const outUri = await burnAndFlatten(renderUri, redactions);
      await Haptic.success();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Sanitized ${title || 'Document'}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      await Haptic.error();
    } finally {
      setExporting(false);
      pendingExport.current = false;
    }
  }, [renderUri, redactions, title]);

  const onExportPress = async () => {
    await Haptic.medium();
    if (!isSubscribed) {
      pendingExport.current = true;
      router.push({
        pathname: '/paywall',
        params: { title: title || 'Document' },
      });
      return;
    }
    await doExport();
  };

  useFocusEffect(
    useCallback(() => {
      if (pendingExport.current && isSubscribed) {
        void doExport();
      }
    }, [isSubscribed, doExport]),
  );

  if (!uri) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.center}>
          <Text style={typography.body}>No vault artifact loaded.</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[typography.headline, { color: AppleDS.accent, marginTop: 12 }]}>
              Go back
            </Text>
          </Pressable>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const activeUri = renderUri ?? uri;
  const draftPx = draft
    ? {
        left: draft.x * canvasSize.width,
        top: draft.y * canvasSize.height,
        width: draft.width * canvasSize.width,
        height: draft.height * canvasSize.height,
      }
    : null;
  const displayTitle = (title || 'Document').replace(/\.pdf$/i, '');

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void Haptic.selection();
              router.back();
            }}
            hitSlop={12}
          >
            <Text style={typography.body}>Cancel</Text>
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.docTitle} numberOfLines={1}>
              {displayTitle}.pdf
            </Text>
            <Text style={styles.pageMeta}>
              Page {pageIndex + 1}/{pageCount}
            </Text>
          </View>
          <Pressable onPress={() => void onExportPress()} style={styles.exportBtn}>
            <Text style={styles.exportText}>Export</Text>
          </Pressable>
        </View>

        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText} numberOfLines={2}>
            {statusPillCopy(redactions.length)}
          </Text>
        </View>

        <View style={styles.canvas} onLayout={onCanvasLayout}>
          <PdfPageViewer uri={activeUri} pageIndex={pageIndex} />
          <GestureDetector gesture={pan}>
            <View style={StyleSheet.absoluteFill} pointerEvents="box-only">
              {pageRedactions.map((r) => (
                <View
                  key={r.id}
                  style={[
                    styles.rect,
                    {
                      left: r.rect.x * canvasSize.width,
                      top: r.rect.y * canvasSize.height,
                      width: r.rect.width * canvasSize.width,
                      height: r.rect.height * canvasSize.height,
                      backgroundColor:
                        r.style === 'blur'
                          ? 'rgba(80,80,80,0.82)'
                          : REDACTION_STYLE_COLOR[r.style],
                    },
                  ]}
                />
              ))}
              {draft && draftPx ? (
                <View
                  style={[
                    styles.rect,
                    {
                      left: draftPx.left,
                      top: draftPx.top,
                      width: draftPx.width,
                      height: draftPx.height,
                      backgroundColor: REDACTION_STYLE_COLOR[style],
                      opacity: 0.9,
                      borderWidth: 1,
                      borderColor: 'rgba(255,72,42,0.55)',
                    },
                  ]}
                >
                  <BurnScanline
                    active
                    width={draftPx.width}
                    height={draftPx.height}
                  />
                </View>
              ) : null}
            </View>
          </GestureDetector>
        </View>

        <View style={styles.pageRow}>
          <Pressable
            disabled={pageIndex <= 0}
            onPress={() => setPageIndex((p) => Math.max(0, p - 1))}
            hitSlop={10}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={pageIndex <= 0 ? AppleDS.labelQuaternary : AppleDS.labelPrimary}
            />
          </Pressable>
          <Text style={typography.captionMedium}>
            Page {pageIndex + 1} / {pageCount}
          </Text>
          <Pressable
            disabled={pageIndex >= pageCount - 1}
            onPress={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
            hitSlop={10}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={
                pageIndex >= pageCount - 1
                  ? AppleDS.labelQuaternary
                  : AppleDS.labelPrimary
              }
            />
          </Pressable>
        </View>

        <FloatingToolbar>
          <View style={styles.toolbarRow}>
            {(['smart', 'manual'] as RedactionMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => void onModeChange(m)}
                style={[styles.seg, mode === m && styles.segActive]}
              >
                <Text
                  style={[
                    typography.captionMedium,
                    { color: mode === m ? AppleDS.accent : AppleDS.labelSecondary },
                  ]}
                >
                  {REDACTION_MODE_LABEL[m]}
                </Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => {
                const order: RedactionStyle[] = ['black', 'blur', 'white'];
                const next = order[(order.indexOf(style) + 1) % order.length];
                setStyle(next);
                void Haptic.selection();
              }}
              style={styles.styleDotWrap}
            >
              <View
                style={[
                  styles.styleDot,
                  { backgroundColor: REDACTION_STYLE_COLOR[style] },
                ]}
              />
            </Pressable>

            <Pressable onPress={() => void undo()} disabled={redactions.length === 0}>
              <Ionicons
                name="arrow-undo"
                size={18}
                color={
                  redactions.length === 0
                    ? AppleDS.labelQuaternary
                    : 'rgba(255,255,255,0.85)'
                }
              />
            </Pressable>
          </View>
          <Text style={[typography.caption, { marginTop: 6, textAlign: 'center' }]}>
            Tool: {REDACTION_STYLE_LABEL[style]}
          </Text>
        </FloatingToolbar>
      </SafeAreaView>

      {loadingDoc ? <LoadingOverlay message="Opening vault artifact…" /> : null}
      {detecting ? <LoadingOverlay message="Scanning threat signatures…" /> : null}
      {exporting ? <LoadingOverlay message="Burning pixels & wiping metadata…" /> : null}
      <SecurityShieldBanner visible={bannerVisible} onDismiss={dismissBanner} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppleDS.separator,
  },
  titleBlock: { flex: 1, alignItems: 'center' },
  docTitle: {
    ...typography.captionMedium,
    color: AppleDS.labelPrimary,
  },
  pageMeta: {
    ...typography.caption,
    marginTop: 2,
    color: AppleDS.labelTertiary,
  },
  statusPill: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(51,214,107,0.06)',
    borderWidth: 1,
    borderColor: AppleDS.separator,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: AppleDS.success,
  },
  statusText: {
    ...typography.captionMedium,
    flex: 1,
    color: 'rgba(200,255,220,0.92)',
    lineHeight: 16,
  },
  exportBtn: {
    backgroundColor: AppleDS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  exportText: {
    ...typography.captionMedium,
    color: '#fff',
  },
  canvas: {
    flex: 1,
    marginHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: AppleDS.surfaceElevated,
    borderWidth: 1,
    borderColor: AppleDS.separator,
  },
  rect: { position: 'absolute', overflow: 'hidden' },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 8,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  seg: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: AppleDS.separator,
  },
  segActive: {
    backgroundColor: AppleDS.accentMuted,
    borderColor: 'rgba(10,133,255,0.4)',
  },
  styleDotWrap: { padding: 4 },
  styleDot: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: AppleDS.separator,
  },
});
