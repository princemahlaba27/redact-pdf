import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { RedactionRect } from '../models/redaction';
import type { TextToken } from '../models/threat';
import { buildPdfBridgeHtml } from '../services/pdfBridgeHtml';
import { readPdfAsBase64 } from '../services/redactionEngine';
import { AppleDS } from '../theme/tokens';

type Props = {
  uri: string;
  pageIndex: number;
  style?: object;
  /** Fired once per document load with every line token (UI-space rects). */
  onTokensExtracted?: (tokens: TextToken[], pageCount: number) => void;
};

export type BurnedPageRaster = {
  pageIndex: number;
  width: number;
  height: number;
  base64: string;
};

export type PdfPageViewerHandle = {
  /** Rasterize every page with blackouts burned into pixels. */
  burnPages: (redactions: RedactionRect[]) => Promise<BurnedPageRaster[]>;
};

type BridgeMessage =
  | { type: 'ready' }
  | { type: 'rendered'; page: number; pages: number; rotate?: number }
  | { type: 'tokens'; tokens: TextToken[]; pages: number }
  | { type: 'burned'; pages: BurnedPageRaster[] }
  | { type: 'error'; message: string };

/**
 * Single-page PDF rasterizer + on-device text extractor (pdf.js).
 * Honors PDF Rotate so pages never paint upside-down, and reports
 * line tokens in top-left normalized UI coordinates.
 */
export const PdfPageViewer = forwardRef<PdfPageViewerHandle, Props>(
  function PdfPageViewer({ uri, pageIndex, style, onTokensExtracted }, ref) {
    const [base64, setBase64] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const webRef = useRef<WebView>(null);
    const tokensCb = useRef(onTokensExtracted);
    tokensCb.current = onTokensExtracted;
    const lastUri = useRef<string | null>(null);
    const burnResolver = useRef<{
      resolve: (pages: BurnedPageRaster[]) => void;
      reject: (err: Error) => void;
    } | null>(null);

    useEffect(() => {
      let cancelled = false;
      setReady(false);
      setBase64(null);
      lastUri.current = uri;
      void (async () => {
        try {
          const data = await readPdfAsBase64(uri);
          if (!cancelled && lastUri.current === uri) setBase64(data);
        } catch {
          if (!cancelled) setBase64(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [uri]);

    useEffect(() => {
      if (!ready || !webRef.current) return;
      webRef.current.injectJavaScript(`window.__renderPage(${pageIndex + 1}); true;`);
    }, [pageIndex, ready]);

    const html = useMemo(() => buildPdfBridgeHtml(), []);

    const injectLoad = (data: string, page: number) => {
      webRef.current?.injectJavaScript(
        `window.__loadPdf(${JSON.stringify(data)}, ${page}); true;`,
      );
    };

    useImperativeHandle(ref, () => ({
      burnPages: (redactions: RedactionRect[]) =>
        new Promise<BurnedPageRaster[]>((resolve, reject) => {
          if (!webRef.current || !ready) {
            reject(new Error('Viewer not ready'));
            return;
          }
          burnResolver.current = { resolve, reject };
          const payload = redactions.map((r) => ({
            pageIndex: r.pageIndex,
            x: r.rect.x,
            y: r.rect.y,
            width: r.rect.width,
            height: r.rect.height,
            style: r.style,
          }));
          webRef.current.injectJavaScript(
            `window.__burnPages(${JSON.stringify(JSON.stringify(payload))}); true;`,
          );
          // Safety timeout
          setTimeout(() => {
            if (burnResolver.current) {
              burnResolver.current.reject(new Error('Burn timed out'));
              burnResolver.current = null;
            }
          }, 90000);
        }),
    }));

    const onMessage = (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as BridgeMessage;
        if (msg.type === 'ready') {
          setReady(true);
          if (base64) injectLoad(base64, pageIndex + 1);
          return;
        }
        if (msg.type === 'tokens') {
          tokensCb.current?.(msg.tokens ?? [], msg.pages ?? 1);
          return;
        }
        if (msg.type === 'burned') {
          burnResolver.current?.resolve(msg.pages ?? []);
          burnResolver.current = null;
          return;
        }
        if (msg.type === 'error') {
          console.warn('[PdfPageViewer]', msg.message);
          if (burnResolver.current) {
            burnResolver.current.reject(new Error(msg.message));
            burnResolver.current = null;
          }
        }
      } catch {
        // ignore malformed bridge payloads
      }
    };

    // Load PDF once when bytes are ready — page flips use __renderPage only.
    // Re-loading on every pageIndex change would re-fire token extraction.
    useEffect(() => {
      if (!ready || !base64 || !webRef.current) return;
      injectLoad(base64, pageIndex + 1);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit pageIndex
    }, [base64, ready]);

    return (
      <View style={[styles.wrap, style]}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          style={styles.web}
          source={{ html }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
        />
        {!ready || !base64 ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: AppleDS.canvas },
  web: { flex: 1, backgroundColor: AppleDS.canvas },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
