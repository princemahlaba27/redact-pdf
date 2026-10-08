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
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PdfPageViewer, type PdfPageViewerHandle } from '../src/components/PdfPageViewer';
import { CategoryFilterBar } from '../src/components/CategoryFilterBar';
import { SecurityShieldBanner } from '../src/components/SecurityShieldBanner';
import { ThreatAuditDrawer } from '../src/components/ThreatAuditDrawer';
import { LoadingOverlay, ScreenBackground } from '../src/components/ui';
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
import { threatInFilter, type RedactionFilterId } from '../src/models/threat';
import { Haptic } from '../src/services/haptics';
import { saveToAppVault } from '../src/services/documentVault';
import { usePendingExport } from '../src/services/pendingExport';
import {
  burnedPagesToPdf,
  burnAndFlatten,
  cachePdfUri,
  getPdfPageCount,
  uuidv4,
} from '../src/services/redactionEngine';
import { useSubscription } from '../src/services/subscription';
import {
  flattenDocumentOnDevice,
  mergeThreats,
  scanDocumentOnDevice,
} from '../src/services/universalRedaction';
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

/** Map a canvas touch back to canvas space after the page view's zoom. */
function contentPoint(
  x: number,
  y: number,
  scale: number,
  tx: number,
  ty: number,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
) {
  'worklet';
  const cx = frameX + frameW / 2;
  const cy = frameY + frameH / 2;
  return {
    x: (x - tx - cx) / scale + cx,
    y: (y - ty - cy) / scale + cy,
  };
}

/** Keep the zoomed page from sliding entirely off the canvas. */
function clampPan(
  scale: number,
  tx: number,
  ty: number,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  canvasW: number,
  canvasH: number,
) {
  'worklet';
  if (scale <= 1.001) return { x: 0, y: 0 };
  const restX = frameX + frameW / 2;
  const restY = frameY + frameH / 2;
  const halfW = (frameW * scale) / 2;
  const halfH = (frameH * scale) / 2;
  const minCx = halfW * 2 >= canvasW ? canvasW - halfW : halfW;
  const maxCx = halfW * 2 >= canvasW ? halfW : canvasW - halfW;
  const minCy = halfH * 2 >= canvasH ? canvasH - halfH : halfH;
  const maxCy = halfH * 2 >= canvasH ? halfH : canvasH - halfH;
  const cx = Math.min(maxCx, Math.max(minCx, restX + tx));
  const cy = Math.min(maxCy, Math.max(minCy, restY + ty));
  return { x: cx - restX, y: cy - restY };
}

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

  const insets = useSafeAreaInsets();
  const { bannerVisible, dismissBanner } = useScreenProtection(true);
  const isSubscribed = useSubscription((s) => s.isSubscribed);
  const queueExport = usePendingExport((s) => s.queueExport);
  const consumePending = usePendingExport((s) => s.consumePending);
  const viewerRef = useRef<PdfPageViewerHandle>(null);
  const visionSeededRef = useRef(false);
  const imageOriginRef = useRef(false);

  const [renderUri, setRenderUri] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<RedactionMode>('manual');
  const [style, setStyle] = useState<RedactionStyle>('black');
  const [manualRedactions, setManualRedactions] = useState<RedactionRect[]>([]);
  const [threats, setThreats] = useState<ThreatItem[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [pageNatural, setPageNatural] = useState({ width: 1, height: 1 });
  const zoomScale = useSharedValue(1);
  const zoomX = useSharedValue(0);
  const zoomY = useSharedValue(0);
  const zoomSavedScale = useSharedValue(1);
  const zoomSavedX = useSharedValue(0);
  const zoomSavedY = useSharedValue(0);
  const canvasW = useSharedValue(1);
  const canvasH = useSharedValue(1);
  const frameX = useSharedValue(0);
  const frameY = useSharedValue(0);
  const frameW = useSharedValue(1);
  const frameH = useSharedValue(1);
  const drawEnabled = useSharedValue(true);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const drawArmedAt = useSharedValue(0);
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
  // One scan of the upright JPEG. Do not OCR the wrapped PDF again.
  useEffect(() => {
    const { tokens, lines, fromImages } =
      useOcrSession.getState().consumePending();
    if (!fromImages) return;
    imageOriginRef.current = true;
    if (tokens.length === 0) return;
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
        if (imageOriginRef.current) return;
        setDetecting(true);
        try {
          const scan = await scanDocumentOnDevice(cached);
          if (!cancelled && (scan.tokens.length > 0 || scan.threats.length > 0)) {
            visionSeededRef.current = true;
            setThreats((prev) => mergeThreats(prev, scan.threats));
            setSnapLines(scan.lines);
            if (scan.threats.length) {
              setAuditOpen(true);
              void Haptic.success();
            }
          }
        } catch (error) {
          console.warn('[universalRedaction] scan failed:', error);
        } finally {
          if (!cancelled) setDetecting(false);
        }
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
  }, [uri, setSnapLines]);

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

  /** Exact pixel frame of the contained page. Overlay boxes use this same rect. */
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

  const onTokensExtracted = useCallback(
    (tokens: TextToken[], pages: number) => {
      if (pages > 0) setPageCount(pages);
      const nextLines = tokensToSnapLines(tokens);
      // Image-origin docs already have Vision tokens — don't replace with empty PDF text layer.
      if (visionSeededRef.current) {
        // Vision word boxes are already precise. pdf.js line unions are wide
        // and would paint blackouts across the wrong columns.
        if (ocrLinesRef.current.length === 0 && nextLines.length > 0) {
          setSnapLines(nextLines);
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
    canvasW.value = width;
    canvasH.value = height;
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

  const cancelDraft = useCallback(() => {
    draftRef.current = null;
    setDraft(null);
    snapStrokeRef.current = { startX: 0, line: null, snapped: false };
  }, []);

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
        .maxPointers(1)
        .manualActivation(true)
        .onTouchesDown((e, manager) => {
          'worklet';
          if (!drawEnabled.value) {
            manager.fail();
            return;
          }
          const t = e.allTouches[0];
          if (!t) return;
          touchStartX.value = t.x;
          touchStartY.value = t.y;
          drawArmedAt.value = Date.now();
        })
        .onTouchesMove((e, manager) => {
          'worklet';
          if (!drawEnabled.value || e.numberOfTouches > 1) {
            manager.fail();
            return;
          }
          const t = e.allTouches[0];
          if (!t) return;
          const dist = Math.hypot(t.x - touchStartX.value, t.y - touchStartY.value);
          if (dist > 12 && Date.now() - drawArmedAt.value > 50) manager.activate();
        })
        .onBegin((e) => {
          'worklet';
          const p = contentPoint(
            e.x,
            e.y,
            zoomScale.value,
            zoomX.value,
            zoomY.value,
            frameX.value,
            frameY.value,
            frameW.value,
            frameH.value,
          );
          runOnJS(syncSnapStroke)(p.x, p.y, true);
        })
        .onUpdate((e) => {
          'worklet';
          const p = contentPoint(
            e.x,
            e.y,
            zoomScale.value,
            zoomX.value,
            zoomY.value,
            frameX.value,
            frameY.value,
            frameW.value,
            frameH.value,
          );
          runOnJS(syncSnapStroke)(p.x, p.y, false);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitDraft)();
        })
        .onFinalize((_e, success) => {
          'worklet';
          if (!success) runOnJS(cancelDraft)();
        }),
    [
      syncSnapStroke,
      commitDraft,
      cancelDraft,
      zoomScale,
      zoomX,
      zoomY,
      frameX,
      frameY,
      frameW,
      frameH,
      drawEnabled,
      touchStartX,
      touchStartY,
      drawArmedAt,
    ],
  );

  const dismissHit = useCallback(
    (x: number, y: number) => {
      const nx = (x - pageFit.offsetX) / Math.max(pageFit.renderWidth, 1);
      const ny = (y - pageFit.offsetY) / Math.max(pageFit.renderHeight, 1);
      const hit = [...pageRedactions]
        .reverse()
        .find(
          (redaction) =>
            nx >= redaction.rect.x &&
            nx <= redaction.rect.x + redaction.rect.width &&
            ny >= redaction.rect.y &&
            ny <= redaction.rect.y + redaction.rect.height,
        );
      if (!hit) return;
      if (hit.source === 'manual') {
        setManualRedactions((prev) => prev.filter((item) => item.id !== hit.id));
      } else {
        setThreats((prev) =>
          prev.map((item) => (item.id === hit.id ? { ...item, enabled: false } : item)),
        );
      }
      void Haptic.selection();
    },
    [pageFit, pageRedactions],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(280)
        .maxDistance(14)
        .onEnd((e) => {
          'worklet';
          const p = contentPoint(
            e.x,
            e.y,
            zoomScale.value,
            zoomX.value,
            zoomY.value,
            frameX.value,
            frameY.value,
            frameW.value,
            frameH.value,
          );
          runOnJS(dismissHit)(p.x, p.y);
        }),
    [dismissHit, zoomScale, zoomX, zoomY, frameX, frameY, frameW, frameH],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          zoomSavedScale.value = zoomScale.value;
          zoomSavedX.value = zoomX.value;
          zoomSavedY.value = zoomY.value;
        })
        .onUpdate((e) => {
          'worklet';
          const start = Math.max(zoomSavedScale.value, 1);
          const next = Math.min(4, Math.max(1, start * e.scale));
          const ratio = next / start;
          const cx = frameX.value + frameW.value / 2;
          const cy = frameY.value + frameH.value / 2;
          const tx = (1 - ratio) * (e.focalX - cx) + ratio * zoomSavedX.value;
          const ty = (1 - ratio) * (e.focalY - cy) + ratio * zoomSavedY.value;
          const clamped = clampPan(
            next,
            tx,
            ty,
            frameX.value,
            frameY.value,
            frameW.value,
            frameH.value,
            canvasW.value,
            canvasH.value,
          );
          zoomScale.value = next;
          zoomX.value = clamped.x;
          zoomY.value = clamped.y;
        })
        .onEnd(() => {
          'worklet';
          if (zoomScale.value <= 1.05) {
            zoomScale.value = withTiming(1);
            zoomX.value = withTiming(0);
            zoomY.value = withTiming(0);
            zoomSavedScale.value = 1;
            zoomSavedX.value = 0;
            zoomSavedY.value = 0;
          } else {
            zoomSavedScale.value = zoomScale.value;
            zoomSavedX.value = zoomX.value;
            zoomSavedY.value = zoomY.value;
          }
        }),
    [zoomScale, zoomSavedScale, zoomX, zoomY, zoomSavedX, zoomSavedY, frameX, frameY, frameW, frameH, canvasW, canvasH],
  );

  const panZoom = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .maxPointers(2)
        .onStart(() => {
          'worklet';
          zoomSavedX.value = zoomX.value;
          zoomSavedY.value = zoomY.value;
        })
        .onUpdate((e) => {
          'worklet';
          if (zoomScale.value <= 1) return;
          const clamped = clampPan(
            zoomScale.value,
            zoomSavedX.value + e.translationX,
            zoomSavedY.value + e.translationY,
            frameX.value,
            frameY.value,
            frameW.value,
            frameH.value,
            canvasW.value,
            canvasH.value,
          );
          zoomX.value = clamped.x;
          zoomY.value = clamped.y;
        }),
    [zoomScale, zoomX, zoomY, zoomSavedX, zoomSavedY, frameX, frameY, frameW, frameH, canvasW, canvasH],
  );

  const drawGesture = useMemo(
    () => Gesture.Simultaneous(pinch, panZoom, Gesture.Race(pan, tap)),
    [pinch, panZoom, tap, pan],
  );

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: zoomX.value },
      { translateY: zoomY.value },
      { scale: zoomScale.value },
    ],
  }));

  useEffect(() => {
    frameX.value = pageFit.offsetX;
    frameY.value = pageFit.offsetY;
    frameW.value = pageFit.renderWidth;
    frameH.value = pageFit.renderHeight;
  }, [pageFit, frameX, frameY, frameW, frameH]);

  useEffect(() => {
    drawEnabled.value = mode === 'manual';
  }, [mode, drawEnabled]);

  useEffect(() => {
    zoomScale.value = withTiming(1, { duration: 160 });
    zoomX.value = withTiming(0, { duration: 160 });
    zoomY.value = withTiming(0, { duration: 160 });
    zoomSavedScale.value = 1;
    zoomSavedX.value = 0;
    zoomSavedY.value = 0;
  }, [pageIndex, zoomScale, zoomX, zoomY, zoomSavedScale, zoomSavedX, zoomSavedY]);

  const onToggleFilter = useCallback((filter: RedactionFilterId) => {
    void Haptic.selection();
    setThreats((prev) => {
      if (filter === 'all') {
        const enable = prev.some((item) => !item.enabled);
        return prev.map((item) => ({ ...item, enabled: enable }));
      }
      const matching = prev.filter((item) => threatInFilter(item, filter));
      const enable = matching.some((item) => !item.enabled);
      return prev.map((item) =>
        threatInFilter(item, filter) ? { ...item, enabled: enable } : item,
      );
    });
  }, []);

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
        outUri = await flattenDocumentOnDevice(renderUri, redactions);
      } catch {
        try {
          const rasters = await viewerRef.current!.burnPages(redactions);
          outUri = await burnedPagesToPdf(
            rasters.map((p) => ({
              base64: p.base64,
              width: p.width,
              height: p.height,
            })),
          );
        } catch {
          outUri = await burnAndFlatten(renderUri, redactions);
        }
      }

      // Retention vault — keep a local copy of every successful export.
      await saveToAppVault(outUri, title || 'Document');

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
      usePendingExport.getState().clear();
    }
  }, [renderUri, redactions, title]);

  /**
   * Post-value export gate:
   * Subscribed → flatten + share immediately.
   * Not subscribed → queue export, open paywall; on purchase success the
   * editor focus effect consumes the queue and runs doExport automatically.
   */
  const onExportPress = async () => {
    await Haptic.medium();
    if (!isSubscribed) {
      queueExport();
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
      if (consumePending() && isSubscribed) {
        void doExport();
      }
    }, [isSubscribed, doExport, consumePending]),
  );

  const onToggleThreat = (id: string, enabled: boolean) => {
    setThreats((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
  };

  const onToggleAllThreats = (enabled: boolean) => {
    setThreats((prev) => prev.map((t) => ({ ...t, enabled })));
  };

  const onFocusThreat = (threat: ThreatItem) => {
    setPageIndex(threat.pageIndex);
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

        <CategoryFilterBar threats={threats} onToggle={onToggleFilter} />

        <View style={styles.canvas} onLayout={onCanvasLayout}>
          <GestureDetector gesture={drawGesture}>
            <Animated.View style={styles.gestureSurface}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pageFrame,
                  zoomStyle,
                  {
                    left: pageFit.offsetX,
                    top: pageFit.offsetY,
                    width: pageFit.renderWidth,
                    height: pageFit.renderHeight,
                  },
                ]}
              >
                <PdfPageViewer
                  ref={viewerRef}
                  uri={activeUri}
                  pageIndex={pageIndex}
                  style={StyleSheet.absoluteFill}
                  onTokensExtracted={onTokensExtracted}
                  onPageFit={(fit) => {
                    setPageNatural((prev) =>
                      prev.width === fit.pageWidth && prev.height === fit.pageHeight
                        ? prev
                        : { width: fit.pageWidth, height: fit.pageHeight },
                    );
                  }}
                />
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {pageRedactions.map((r) => {
                    const box = mapPageRectToScreen(
                      r.rect,
                      {
                        ...pageFit,
                        offsetX: 0,
                        offsetY: 0,
                      },
                      { padX: 0, padY: 0 },
                    );
                    return (
                      <View
                        key={r.id}
                        style={[
                          styles.rect,
                          {
                            left: box.left,
                            top: box.top,
                            width: box.width,
                            height: box.height,
                            backgroundColor:
                              r.style === 'blur'
                                ? 'rgba(90,90,90,0.92)'
                                : REDACTION_STYLE_COLOR[r.style],
                          },
                        ]}
                      />
                    );
                  })}
                  {draft ? (
                    <View
                      style={[
                        styles.rect,
                        {
                          left: draft.x * pageFit.renderWidth,
                          top: draft.y * pageFit.renderHeight,
                          width: draft.width * pageFit.renderWidth,
                          height: draft.height * pageFit.renderHeight,
                          backgroundColor: '#000000',
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </View>

        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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
              accessibilityLabel={`Color ${REDACTION_STYLE_LABEL[style]}`}
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
              accessibilityLabel="Undo"
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
          <Text style={styles.dockHint}>
            {REDACTION_STYLE_LABEL[style]} · Select to remove · Pinch to zoom
          </Text>
        </View>
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
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  gestureSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  pageFrame: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  rect: {
    position: 'absolute',
  },
  dock: {
    paddingTop: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1c1c1e',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppleDS.separator,
  },
  dockHint: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: 6,
    color: AppleDS.labelTertiary,
  },
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
