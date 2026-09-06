import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { readPdfAsBase64 } from '../services/redactionEngine';
import { AppleDS } from '../theme/tokens';

type Props = {
  uri: string;
  pageIndex: number;
  style?: object;
};

/**
 * Renders a single PDF page via pdf.js → HTML canvas inside a WebView.
 * Avoids iOS `<embed src="file://">` black canvases by injecting base64 bytes
 * from a locally cached copy (see `cachePdfUri`).
 */
export function PdfPageViewer({ uri, pageIndex, style }: Props) {
  const [base64, setBase64] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setBase64(null);
    void (async () => {
      try {
        const data = await readPdfAsBase64(uri);
        if (!cancelled) setBase64(data);
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

  const html = useMemo(() => buildViewerHtml(), []);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type?: string };
      if (msg.type === 'ready') {
        setReady(true);
        if (base64) {
          webRef.current?.injectJavaScript(
            `window.__loadPdf(${JSON.stringify(base64)}, ${pageIndex + 1}); true;`,
          );
        }
      }
    } catch {
      // ignore malformed bridge messages
    }
  };

  useEffect(() => {
    if (!ready || !base64 || !webRef.current) return;
    webRef.current.injectJavaScript(
      `window.__loadPdf(${JSON.stringify(base64)}, ${pageIndex + 1}); true;`,
    );
  }, [base64, ready, pageIndex]);

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
}

function buildViewerHtml(): string {
  // pdf.js 3.11 from CDN — renders into a white page canvas on dark chrome.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#0A0A0C; overflow:hidden; }
    #stage { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
    canvas { max-width:100%; max-height:100%; box-shadow:0 0 0 1px #1F242F; background:#fff; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
  <div id="stage"><canvas id="c"></canvas></div>
  <script>
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    let pdfDoc = null;

    function post(type, extra) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...extra }));
    }

    function b64ToUint8(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    async function paint(pageNum) {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(pageNum);
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      const stage = document.getElementById('stage');
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(stage.clientWidth / base.width, stage.clientHeight / base.height) * 2;
      const viewport = page.getViewport({ scale: Math.max(scale, 1.25) });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = (viewport.width / 2) + 'px';
      canvas.style.height = (viewport.height / 2) + 'px';
      await page.render({ canvasContext: ctx, viewport }).promise;
      post('rendered', { page: pageNum, pages: pdfDoc.numPages });
    }

    window.__renderPage = function(pageNum) {
      paint(pageNum).catch(function(err){ post('error', { message: String(err) }); });
    };

    window.__loadPdf = async function(b64, pageNum) {
      try {
        const data = b64ToUint8(b64);
        pdfDoc = await pdfjsLib.getDocument({ data: data }).promise;
        await paint(pageNum || 1);
      } catch (err) {
        post('error', { message: String(err) });
      }
    };

    post('ready');
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: AppleDS.canvas },
  web: { flex: 1, backgroundColor: AppleDS.canvas },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,12,0.55)',
  },
});
