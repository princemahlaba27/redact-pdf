import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import {
  FloatingToolbar,
  LoadingOverlay,
  ScreenBackground,
} from '../src/components/ui';
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
  detectPiiInPdf,
  getPdfPageCount,
  uuidv4,
} from '../src/services/redactionEngine';
import { useSubscription } from '../src/services/subscription';
import { AppleDS, typography } from '../src/theme/tokens';

export default function EditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri: string; title: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : params.title;

  const isSubscribed = useSubscription((s) => s.isSubscribed);
  const pendingExport = useRef(false);

  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<RedactionMode>('manual');
  const [style, setStyle] = useState<RedactionStyle>('black');
  const [redactions, setRedactions] = useState<RedactionRect[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState<NormalizedRect | null>(null);
  const draftRef = useRef<NormalizedRect | null>(null);

  useEffect(() => {
    if (!uri) return;
    void getPdfPageCount(uri).then(setPageCount).catch(() => setPageCount(1));
  }, [uri]);

  const pageRedactions = useMemo(
    () => redactions.filter((r) => r.pageIndex === pageIndex),
    [redactions, pageIndex],
  );

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const addRedaction = useCallback(
    (rect: NormalizedRect) => {
      if (rect.width < 0.01 || rect.height < 0.01) return;
      setRedactions((prev) => [
        ...prev,
        { id: uuidv4(), pageIndex, rect, style },
      ]);
      void Haptic.light();
    },
    [pageIndex, style],
  );

  const updateDraft = (rect: NormalizedRect | null) => {
    draftRef.current = rect;
    setDraft(rect);
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
          const x = e.x / canvasSize.width;
          const y = e.y / canvasSize.height;
          runOnJS(updateDraft)({ x, y, width: 0, height: 0 });
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
    [mode, canvasSize.width, canvasSize.height, addRedaction],
  );

  const runSmart = async () => {
    if (!uri || detecting) return;
    setDetecting(true);
    try {
      const found = await detectPiiInPdf(uri, pageIndex, style);
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
    if (!uri) return;
    setExporting(true);
    try {
      const outUri = await burnAndFlatten(uri, redactions);
      await Haptic.success();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Redacted ${title || 'Document'}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch {
      await Haptic.error();
    } finally {
      setExporting(false);
      pendingExport.current = false;
    }
  }, [uri, redactions, title]);

  const onExportPress = async () => {
    await Haptic.medium();
    if (!isSubscribed) {
      pendingExport.current = true;
      router.push('/paywall');
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
          <Text style={typography.body}>Missing document.</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[typography.headline, { color: AppleDS.accent, marginTop: 12 }]}>
              Go back
            </Text>
          </Pressable>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const pdfSource =
    Platform.OS === 'android'
      ? { uri }
      : {
          html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>html,body{margin:0;height:100%;background:#0D0D0E}</style></head>
            <body><embed src="${uri}" type="application/pdf" width="100%" height="100%" /></body></html>`,
        };

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
          <Text style={[typography.footnoteMedium, styles.title]} numberOfLines={1}>
            {title || 'Document'}
          </Text>
          <Pressable onPress={() => void onExportPress()} style={styles.exportBtn}>
            <Text style={[typography.captionMedium, { color: '#fff' }]}>Export</Text>
          </Pressable>
        </View>

        <View style={styles.canvas} onLayout={onCanvasLayout}>
          <WebView
            originWhitelist={['*']}
            allowFileAccess
            allowUniversalAccessFromFileURLs
            style={styles.webview}
            source={pdfSource}
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
                          ? 'rgba(80,80,80,0.75)'
                          : REDACTION_STYLE_COLOR[r.style],
                    },
                  ]}
                />
              ))}
              {draft ? (
                <View
                  style={[
                    styles.rect,
                    {
                      left: draft.x * canvasSize.width,
                      top: draft.y * canvasSize.height,
                      width: draft.width * canvasSize.width,
                      height: draft.height * canvasSize.height,
                      backgroundColor: REDACTION_STYLE_COLOR[style],
                      opacity: 0.85,
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

            <Text style={[typography.captionMedium, { flexShrink: 1 }]}>
              {redactions.length} Redactions
            </Text>

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
            Style: {REDACTION_STYLE_LABEL[style]}
          </Text>
        </FloatingToolbar>
      </SafeAreaView>

      {detecting ? <LoadingOverlay message="Scanning for sensitive data…" /> : null}
      {exporting ? <LoadingOverlay message="Flattening & sanitizing…" /> : null}
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
    gap: 12,
  },
  title: { flex: 1, textAlign: 'center' },
  exportBtn: {
    backgroundColor: AppleDS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  canvas: {
    flex: 1,
    marginHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: AppleDS.surface,
  },
  webview: { flex: 1, backgroundColor: AppleDS.surface },
  rect: { position: 'absolute' },
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
  },
  seg: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  segActive: {
    backgroundColor: AppleDS.accentMuted,
  },
  styleDotWrap: { padding: 4 },
  styleDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: AppleDS.separator,
  },
});
