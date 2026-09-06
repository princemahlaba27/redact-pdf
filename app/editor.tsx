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
import {
  PdfPageViewer,
  type PdfPageViewerHandle,
} from '../src/components/PdfPageViewer';
import { SecurityShieldBanner } from '../src/components/SecurityShieldBanner';
import { ThreatAuditDrawer } from '../src/components/ThreatAuditDrawer';
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
import type { TextToken, ThreatItem } from '../src/models/threat';
import { Haptic } from '../src/services/haptics';
import {
  burnedPagesToPdf,
  burnAndFlatten,
  cachePdfUri,
  getPdfPageCount,
  uuidv4,
} from '../src/services/redactionEngine';
import { useSubscription } from '../src/services/subscription';
import {
  classifyTextTokens,
  threatsToRedactions,
} from '../src/services/threatClassifier';
import { AppleDS, typography } from '../src/theme/tokens';

function statusCopy(total: number, selected: number): string {
  if (total <= 0) {
    return '0 Items Hidden · Document Details Erased on export';
  }
  return `${selected}/${total} Items Hidden · Document Details Erased on export`;
}

export default function EditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri: string; title: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : params.title;

  const { bannerVisible, dismissBanner } = useScreenProtection(true);
  const isSubscribed = useSubscription((s) => s.isSubscribed);
  const pendingExport = useRef(false);
  const viewerRef = useRef<PdfPageViewerHandle>(null);

  const [renderUri, setRenderUri] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<RedactionMode>('manual');
  const [style, setStyle] = useState<RedactionStyle>('black');
  const [manualRedactions, setManualRedactions] = useState<RedactionRect[]>([]);
  const [threats, setThreats] = useState<ThreatItem[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [focusPulseId, setFocusPulseId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState<NormalizedRect | null>(null);
  const draftRef = useRef<NormalizedRect | null>(null);
  const lastBurnPulse = useRef(0);

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

  const threatRedactions = useMemo(
    () => threatsToRedactions(threats, style),
    [threats, style],
  );

  const redactions = useMemo(
    () => [...threatRedactions, ...manualRedactions],
    [threatRedactions, manualRedactions],
  );

  const pageRedactions = useMemo(
    () => redactions.filter((r) => r.pageIndex === pageIndex),
    [redactions, pageIndex],
  );

  const selectedCount = threats.filter((t) => t.enabled).length;

  const onTokensExtracted = useCallback((tokens: TextToken[], pages: number) => {
    if (pages > 0) setPageCount(pages);
    setDetecting(true);
    try {
      const found = classifyTextTokens(tokens);
      setThreats(found);
      if (found.length) {
        setAuditOpen(true);
        void Haptic.success();
      }
    } finally {
      setDetecting(false);
    }
  }, []);

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

  const addManualRedaction = useCallback(
    (rect: NormalizedRect) => {
      if (rect.width < 0.01 || rect.height < 0.01) return;
      setManualRedactions((prev) => [
        ...prev,
        { id: uuidv4(), pageIndex, rect, style, source: 'manual' },
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
    if (current) addManualRedaction(current);
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
    [mode, canvasSize.width, canvasSize.height, addManualRedaction, pulseBurnHaptic],
  );

  const onModeChange = async (next: RedactionMode) => {
    setMode(next);
    await Haptic.selection();
    if (next === 'smart') {
      setAuditOpen(true);
      if (threats.length === 0) await Haptic.warning();
    }
  };

  const undo = async () => {
    if (manualRedactions.length) {
      setManualRedactions((prev) => prev.slice(0, -1));
    } else {
      setThreats((prev) => {
        const armed = [...prev].reverse().find((t) => t.enabled);
        if (!armed) return prev;
        return prev.map((t) =>
          t.id === armed.id ? { ...t, enabled: false } : t,
        );
      });
    }
    await Haptic.selection();
  };

  const doExport = useCallback(async () => {
    if (!renderUri) return;
    setExporting(true);
    try {
      let outUri: string;
      try {
        // Prefer true pixel burn: rasterize each page with blackouts baked in.
        const rasters = await viewerRef.current!.burnPages(redactions);
        outUri = await burnedPagesToPdf(
          rasters.map((p) => ({
            base64: p.base64,
            width: p.width,
            height: p.height,
          })),
        );
      } catch {
        // Fallback: opaque vector fills + metadata wipe.
        outUri = await burnAndFlatten(renderUri, redactions);
      }
      await Haptic.success();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Save ${title || 'Document'}`,
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

  const onToggleThreat = (id: string, enabled: boolean) => {
    setThreats((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
  };

  const onToggleAllThreats = (enabled: boolean) => {
    setThreats((prev) => prev.map((t) => ({ ...t, enabled })));
  };

  const onFocusThreat = (threat: ThreatItem) => {
    setPageIndex(threat.pageIndex);
    setFocusPulseId(threat.id);
    setTimeout(() => setFocusPulseId(null), 1200);
    void Haptic.selection();
  };

  if (!uri) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.center}>
          <Text style={typography.body}>No document loaded.</Text>
          <Pressable onPress={() => router.back()}>
            <Text
              style={[
                typography.headline,
                { color: AppleDS.accent, marginTop: 12 },
              ]}
            >
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

        <Pressable
          onPress={() => {
            void Haptic.selection();
            setAuditOpen(true);
          }}
          style={styles.statusPill}
        >
          <View style={styles.statusDot} />
          <Text style={styles.statusText} numberOfLines={2}>
            {statusCopy(threats.length, selectedCount)}
          </Text>
          <Ionicons name="chevron-up" size={16} color={AppleDS.success} />
        </Pressable>

        <View style={styles.canvas} onLayout={onCanvasLayout}>
          <PdfPageViewer
            ref={viewerRef}
            uri={activeUri}
            pageIndex={pageIndex}
            onTokensExtracted={onTokensExtracted}
          />
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
                      borderWidth: focusPulseId === r.id ? 2 : 0,
                      borderColor: AppleDS.amber,
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
              color={
                pageIndex <= 0 ? AppleDS.labelQuaternary : AppleDS.labelPrimary
              }
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
                    {
                      color:
                        mode === m ? AppleDS.accent : AppleDS.labelSecondary,
                    },
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

            <Pressable
              onPress={() => void undo()}
              disabled={redactions.length === 0}
            >
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
            Color: {REDACTION_STYLE_LABEL[style]}
          </Text>
        </FloatingToolbar>
      </SafeAreaView>

      {loadingDoc ? <LoadingOverlay message="Opening document…" /> : null}
      {detecting ? <LoadingOverlay message="Finding private details…" /> : null}
      {exporting ? (
        <LoadingOverlay message="Applying permanent blackout…" />
      ) : null}
      <SecurityShieldBanner visible={bannerVisible} onDismiss={dismissBanner} />
      <ThreatAuditDrawer
        visible={auditOpen}
        threats={threats}
        onClose={() => setAuditOpen(false)}
        onToggle={onToggleThreat}
        onToggleAll={onToggleAllThreats}
        onFocusThreat={onFocusThreat}
      />
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
    marginHorizontal: 24,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: AppleDS.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
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
    color: AppleDS.labelSecondary,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separator,
  },
  segActive: {
    backgroundColor: AppleDS.accentMuted,
    borderColor: 'rgba(10,132,255,0.4)',
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
