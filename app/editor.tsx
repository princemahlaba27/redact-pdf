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
import type { OcrSnapLine, TextToken, ThreatItem } from '../src/models/threat';
import { Haptic } from '../src/services/haptics';
import {
  burnedPagesToPdf,
  burnAndFlatten,
  cachePdfUri,
  getPdfPageCount,
  uuidv4,
} from '../src/services/redactionEngine';
import { useSubscription } from '../src/services/subscription';
import { useOcrSession } from '../src/services/ocrSession';
import {
  classifyTextTokens,
  tokensToSnapLines,
  threatsToRedactions,
} from '../src/services/threatClassifier';
import { AppleDS, typography } from '../src/theme/tokens';
import {
  computeAspectFit,
  mapPageRectToScreen,
  mapScreenRectToPage,
  type PageFit,
} from '../src/utils/pageFit';

/** Vertical snap radius (pt) for the text-snap highlighter brush. */
const SNAP_RADIUS_PT = 16;

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
  const visionSeededRef = useRef(false);

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
  const [pageNatural, setPageNatural] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState<NormalizedRect | null>(null);
  const draftRef = useRef<NormalizedRect | null>(null);
  const ocrLinesRef = useRef<OcrSnapLine[]>([]);
  const snapStrokeRef = useRef<{
    startX: number;
    line: OcrSnapLine | null;
    snapped: boolean;
  }>({ startX: 0, line: null, snapped: false });
  const lastSnapHaptic = useRef(0);

  const setSnapLines = useCallback((lines: OcrSnapLine[]) => {
    ocrLinesRef.current = lines;
  }, []);

  // Seed Private Details from Apple Vision when this doc came from photos.
  useEffect(() => {
    const { tokens, lines, fromImages } =
      useOcrSession.getState().consumePending();
    if (!fromImages || tokens.length === 0) return;
    visionSeededRef.current = true;
    setDetecting(true);
    try {
      const found = classifyTextTokens(tokens);
      setThreats(found);
      setSnapLines(lines.length ? lines : tokensToSnapLines(tokens));
      const maxPage = tokens.reduce((m, t) => Math.max(m, t.pageIndex + 1), 1);
      if (maxPage > 0) setPageCount((c) => Math.max(c, maxPage));
      if (found.length) {
        setAuditOpen(true);
        void Haptic.success();
      }
    } finally {
      setDetecting(false);
    }
  }, [setSnapLines]);

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

  /** Aspect-fit page frame inside the canvas — keeps blackouts glued to glyphs. */
  const pageFit: PageFit = useMemo(
    () =>
      computeAspectFit(
        pageNatural.width,
        pageNatural.height,
        canvasSize.width,
        canvasSize.height,
      ),
    [pageNatural.width, pageNatural.height, canvasSize.width, canvasSize.height],
  );

  const toScreen = useCallback(
    (rect: NormalizedRect) => mapPageRectToScreen(rect, pageFit),
    [pageFit],
  );

  const onTokensExtracted = useCallback(
    (tokens: TextToken[], pages: number) => {
      if (pages > 0) setPageCount(pages);
      const nextLines = tokensToSnapLines(tokens);
      // Image-origin docs already have Vision tokens — don't replace with empty PDF text layer.
      if (visionSeededRef.current && tokens.length === 0) return;
      if (visionSeededRef.current && tokens.length > 0) {
        // Merge rare embedded text with Vision hits; append snap lines.
        setDetecting(true);
        try {
          setThreats((prev) => {
            const extra = classifyTextTokens(tokens);
            const keys = new Set(
              prev.map(
                (t) =>
                  `${t.pageIndex}|${t.badge}|${t.text.toLowerCase()}|${t.rect.x.toFixed(3)}|${t.rect.y.toFixed(3)}`,
              ),
            );
            const merged = [...prev];
            for (const item of extra) {
              const key = `${item.pageIndex}|${item.badge}|${item.text.toLowerCase()}|${item.rect.x.toFixed(3)}|${item.rect.y.toFixed(3)}`;
              if (!keys.has(key)) merged.push(item);
            }
            return merged;
          });
          setSnapLines([
            ...ocrLinesRef.current,
            ...nextLines.filter(
              (l) =>
                !ocrLinesRef.current.some(
                  (e) =>
                    e.pageIndex === l.pageIndex &&
                    Math.abs(e.rect.y - l.rect.y) < 0.01 &&
                    Math.abs(e.rect.x - l.rect.x) < 0.01,
                ),
            ),
          ]);
        } finally {
          setDetecting(false);
        }
        return;
      }
      setDetecting(true);
      try {
        const found = classifyTextTokens(tokens);
        setThreats(found);
        setSnapLines(nextLines);
        if (found.length) {
          setAuditOpen(true);
          void Haptic.success();
        }
      } finally {
        setDetecting(false);
      }
    },
    [setSnapLines],
  );

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const addManualRedaction = useCallback(
    (rect: NormalizedRect) => {
      if (rect.width < 0.008 || rect.height < 0.006) return;
      setManualRedactions((prev) => [
        ...prev,
        {
          id: uuidv4(),
          pageIndex,
          rect,
          // Text-snap highlighter always burns solid black.
          style: 'black',
          source: 'manual',
        },
      ]);
      void Haptic.medium();
    },
    [pageIndex],
  );

  const updateDraft = useCallback((rect: NormalizedRect | null) => {
    draftRef.current = rect;
    setDraft(rect);
  }, []);

  const commitDraft = useCallback(() => {
    const current = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    snapStrokeRef.current = { startX: 0, line: null, snapped: false };
    if (current) addManualRedaction(current);
  }, [addManualRedaction]);

  /**
   * Find nearest OCR line within 16pt vertical radius of the touch.
   * Snaps stroke top/height to that line; width follows finger X.
   */
  const findSnapLine = useCallback(
    (touchX: number, touchY: number): OcrSnapLine | null => {
      let best: OcrSnapLine | null = null;
      let bestDist = SNAP_RADIUS_PT + 1;
      for (const line of ocrLinesRef.current) {
        if (line.pageIndex !== pageIndex) continue;
        const screen = mapPageRectToScreen(line.rect, pageFit, {
          padX: 0,
          padY: 0,
        });
        const midY = screen.top + screen.height / 2;
        const dist = Math.abs(midY - touchY);
        if (dist > SNAP_RADIUS_PT) continue;
        // Prefer lines whose horizontal span is near the finger.
        const inXPad =
          touchX >= screen.left - 24 &&
          touchX <= screen.left + screen.width + 24;
        const score = dist + (inXPad ? 0 : 4);
        if (score < bestDist) {
          bestDist = score;
          best = line;
        }
      }
      return best;
    },
    [pageFit, pageIndex],
  );

  const syncSnapStroke = useCallback(
    (touchX: number, touchY: number, isBegin: boolean) => {
      if (isBegin) {
        snapStrokeRef.current = {
          startX: touchX,
          line: null,
          snapped: false,
        };
      }

      const pageLines = ocrLinesRef.current.filter(
        (l) => l.pageIndex === pageIndex,
      );
      const line = findSnapLine(touchX, touchY);

      // Freeform fallback only when this page has no OCR/PDF text lines.
      if (!line && pageLines.length === 0) {
        const startX = snapStrokeRef.current.startX;
        const startY = isBegin
          ? touchY
          : (snapStrokeRef.current as { startY?: number }).startY ?? touchY;
        if (isBegin) {
          (snapStrokeRef.current as { startY?: number }).startY = touchY;
        }
        const pageRect = mapScreenRectToPage(
          {
            x: Math.min(startX, touchX),
            y: Math.min(startY, touchY),
            width: Math.max(Math.abs(touchX - startX), 8),
            height: Math.max(Math.abs(touchY - startY), 8),
          },
          pageFit,
        );
        updateDraft(pageRect);
        return;
      }

      if (!line) {
        // No nearby text — clear draft so we never paint empty white space.
        if (!snapStrokeRef.current.line) {
          updateDraft(null);
        }
        return;
      }

      const previous = snapStrokeRef.current.line;
      const lineChanged =
        !previous ||
        previous.pageIndex !== line.pageIndex ||
        Math.abs(previous.rect.y - line.rect.y) > 0.002;
      snapStrokeRef.current.line = line;

      // Light haptic when the stroke first snaps onto a text line.
      if (!snapStrokeRef.current.snapped || lineChanged) {
        const now = Date.now();
        if (now - lastSnapHaptic.current > 90) {
          lastSnapHaptic.current = now;
          void Haptic.light();
        }
        snapStrokeRef.current.snapped = true;
      }

      const startX = snapStrokeRef.current.startX;
      const left = Math.min(startX, touchX);
      const width = Math.max(Math.abs(touchX - startX), 8);
      const lineScreen = mapPageRectToScreen(line.rect, pageFit, {
        padX: 0,
        padY: 0,
      });
      // Snap Y/height to the OCR line; extend width with horizontal progress.
      const pageRect = mapScreenRectToPage(
        {
          x: left,
          y: lineScreen.top,
          width,
          height: lineScreen.height,
        },
        pageFit,
      );
      // Lock to exact line baseline/height in page space.
      pageRect.y = line.rect.y;
      pageRect.height = Math.max(line.rect.height, 0.01);
      updateDraft(pageRect);
    },
    [findSnapLine, pageFit, pageIndex, updateDraft],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(mode === 'manual')
        .onBegin((e) => {
          'worklet';
          runOnJS(syncSnapStroke)(e.x, e.y, true);
        })
        .onUpdate((e) => {
          'worklet';
          runOnJS(syncSnapStroke)(e.x, e.y, false);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitDraft)();
        }),
    [mode, syncSnapStroke, commitDraft],
  );

  const onModeChange = async (next: RedactionMode) => {
    setMode(next);
    await Haptic.selection();
    if (next === 'smart') {
      setAuditOpen(true);
      if (threats.length === 0) await Haptic.warning();
    }
  };

  /** Undo only pops user-drawn boxes — OCR checklist items stay intact. */
  const undo = async () => {
    if (manualRedactions.length === 0) return;
    setManualRedactions((prev) => prev.slice(0, -1));
    await Haptic.light();
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
  const draftPx = draft ? toScreen(draft) : null;
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
            onPageFit={(fit) =>
              setPageNatural({ width: fit.pageWidth, height: fit.pageHeight })
            }
          />
          <GestureDetector gesture={pan}>
            <View style={StyleSheet.absoluteFill} pointerEvents="box-only">
              {pageRedactions.map((r) => (
                <View
                  key={r.id}
                  style={[
                    styles.rect,
                    {
                      left: toScreen(r.rect).left,
                      top: toScreen(r.rect).top,
                      width: toScreen(r.rect).width,
                      height: toScreen(r.rect).height,
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
                      // Crisp solid black marker fill while dragging.
                      backgroundColor: '#000000',
                      opacity: 1,
                    },
                  ]}
                />
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
              disabled={manualRedactions.length === 0}
            >
              <Ionicons
                name="arrow-undo"
                size={18}
                color={
                  manualRedactions.length === 0
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
