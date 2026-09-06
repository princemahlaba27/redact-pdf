/**
 * Hidden pdf.js bridge HTML.
 * - Applies page.rotate so orientation never flips upside-down.
 * - Extracts every text item with viewport-space bounds (top-left origin).
 * - Converts to normalized UI rects: y increases downward.
 * - Supports pixel-burn export: rasterize page + opaque blackouts → PNG.
 */
export function buildPdfBridgeHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden; }
    #stage { width:100%; height:100%; display:flex; align-items:center; justify-content:center; position:relative; }
    canvas { max-width:100%; max-height:100%; background:#fff; }
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
    let currentPage = 1;

    function post(type, extra) {
      window.ReactNativeWebView &&
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...(extra || {}) }));
    }

    function b64ToUint8(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    /** Build viewport honoring PDF Rotate / EXIF orientation. */
    function pageViewport(page, scale) {
      const rotation = typeof page.rotate === 'number' ? page.rotate : 0;
      return page.getViewport({ scale: scale, rotation: rotation });
    }

    /**
     * Convert a PDF-user-space Y (bottom-left origin, normalized 0–1) to
     * UI top-left Y using the explicit inversion formula:
     *   renderedY = (pageHeight - (visionY * pageHeight)) - (boxH * pageHeight)
     * which in normalized form is:  uiY = 1 - visionY - boxH
     */
    function invertPdfY(visionYNorm, boxHNorm) {
      return 1 - visionYNorm - boxHNorm;
    }

    /**
     * pdf.js item.transform is in PDF user space (origin bottom-left).
     * After combining with viewport.transform, Y is top-left (canvas space).
     * Normalize to 0–1 UI rects.
     */
    function itemToUiRect(item, viewport) {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontH = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]) || 10;
      const widthPx = (item.width || 0) * Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
      const pageW = viewport.width;
      const pageH = viewport.height;

      // Primary path: viewport already maps to top-left canvas space.
      let left = tx[4];
      let top = tx[5] - fontH;
      let x = left / pageW;
      let y = top / pageH;
      let w = widthPx / pageW;
      let h = fontH / pageH;

      // Fallback: rare matrices that still report bottom-left PDF Y.
      if (y < -0.08 || y > 1.08 || !isFinite(y)) {
        const pdfY = item.transform[5];
        const unscaledH = pageH / (viewport.scale || 1);
        const pdfH = fontH / (viewport.scale || 1);
        const visionYNorm = pdfY / unscaledH;
        const boxHNorm = pdfH / unscaledH;
        y = invertPdfY(visionYNorm, boxHNorm);
        x = (item.transform[4] || 0) / (pageW / (viewport.scale || 1));
        w = Math.max(w, 0.02);
        h = Math.max(boxHNorm, 0.01);
      }

      x = Math.min(Math.max(x, 0), 1);
      y = Math.min(Math.max(y, 0), 1);
      w = Math.min(Math.max(w, 0.004), 1 - x);
      h = Math.min(Math.max(h, 0.008), 1 - y);
      return { x: x, y: y, width: w, height: h };
    }

    async function extractPageTokens(pageIndex0) {
      const page = await pdfDoc.getPage(pageIndex0 + 1);
      const viewport = pageViewport(page, 1);
      const content = await page.getTextContent({ disableCombineTextItems: false });
      const tokens = [];
      const lines = [];
      for (const item of content.items) {
        if (!item.str || !String(item.str).trim()) continue;
        const rect = itemToUiRect(item, viewport);
        const midY = rect.y + rect.height / 2;
        let line = lines.find(function(L) {
          return Math.abs(L.midY - midY) < Math.max(rect.height * 0.65, 0.008);
        });
        if (!line) {
          line = { midY: midY, parts: [] };
          lines.push(line);
        }
        line.parts.push({ text: item.str, rect: rect });
      }
      lines.sort(function(a, b) { return a.midY - b.midY; });
      for (const line of lines) {
        line.parts.sort(function(a, b) { return a.rect.x - b.rect.x; });
        const text = line.parts.map(function(p) { return p.text; }).join('').replace(/\\s+/g, ' ').trim();
        if (!text) continue;
        const x0 = Math.min.apply(null, line.parts.map(function(p) { return p.rect.x; }));
        const y0 = Math.min.apply(null, line.parts.map(function(p) { return p.rect.y; }));
        const x1 = Math.max.apply(null, line.parts.map(function(p) { return p.rect.x + p.rect.width; }));
        const y1 = Math.max.apply(null, line.parts.map(function(p) { return p.rect.y + p.rect.height; }));
        tokens.push({
          text: text,
          pageIndex: pageIndex0,
          rect: { x: x0, y: y0, width: Math.max(x1 - x0, 0.01), height: Math.max(y1 - y0, 0.01) }
        });
      }
      return tokens;
    }

    async function extractAllTokens() {
      const all = [];
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const pageTokens = await extractPageTokens(i);
        for (let t = 0; t < pageTokens.length; t++) all.push(pageTokens[t]);
      }
      return all;
    }

    async function paint(pageNum) {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(pageNum);
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      const stage = document.getElementById('stage');
      const base = pageViewport(page, 1);
      const fit = Math.min(stage.clientWidth / base.width, stage.clientHeight / base.height);
      const scale = Math.max(fit * 2, 1.25);
      const viewport = pageViewport(page, scale);
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = (viewport.width / 2) + 'px';
      canvas.style.height = (viewport.height / 2) + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      post('rendered', {
        page: pageNum,
        pages: pdfDoc.numPages,
        rotate: page.rotate || 0,
        width: viewport.width,
        height: viewport.height
      });
    }

    /**
     * Rasterize every page with opaque blackout rects burned into pixels.
     * rects: [{ pageIndex, x, y, width, height, style }] in UI top-left normalized space.
     */
    async function burnAllPages(rects) {
      const pages = [];
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i + 1);
        const viewport = pageViewport(page, 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        const pageRects = (rects || []).filter(function(r) { return r.pageIndex === i; });
        for (let r = 0; r < pageRects.length; r++) {
          const box = pageRects[r];
          const bx = box.x * canvas.width;
          const by = box.y * canvas.height;
          const bw = box.width * canvas.width;
          const bh = box.height * canvas.height;
          if (box.style === 'white') ctx.fillStyle = '#ffffff';
          else if (box.style === 'blur') ctx.fillStyle = '#5a5a5a';
          else ctx.fillStyle = '#000000';
          ctx.fillRect(bx, by, bw, bh);
        }
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const comma = dataUrl.indexOf(',');
        pages.push({
          pageIndex: i,
          width: canvas.width,
          height: canvas.height,
          base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
        });
      }
      return pages;
    }

    window.__renderPage = function(pageNum) {
      currentPage = pageNum || 1;
      paint(currentPage).catch(function(err) { post('error', { message: String(err) }); });
    };

    window.__loadPdf = async function(b64, pageNum) {
      try {
        const data = b64ToUint8(b64);
        pdfDoc = await pdfjsLib.getDocument({ data: data, isEvalSupported: false }).promise;
        currentPage = pageNum || 1;
        await paint(currentPage);
        const tokens = await extractAllTokens();
        post('tokens', { tokens: tokens, pages: pdfDoc.numPages });
      } catch (err) {
        post('error', { message: String(err) });
      }
    };

    window.__extractTokens = async function() {
      try {
        if (!pdfDoc) return;
        const tokens = await extractAllTokens();
        post('tokens', { tokens: tokens, pages: pdfDoc.numPages });
      } catch (err) {
        post('error', { message: String(err) });
      }
    };

    window.__burnPages = async function(rectsJson) {
      try {
        if (!pdfDoc) {
          post('error', { message: 'No PDF loaded for burn' });
          return;
        }
        const rects = typeof rectsJson === 'string' ? JSON.parse(rectsJson) : (rectsJson || []);
        const pages = await burnAllPages(rects);
        post('burned', { pages: pages });
      } catch (err) {
        post('error', { message: String(err) });
      }
    };

    post('ready');
  </script>
</body>
</html>`;
}
