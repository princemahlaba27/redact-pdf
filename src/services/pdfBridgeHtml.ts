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
     * Explicit Y flip (PDF bottom-left → screen top-left):
     *   screenY = viewportHeight - y - height
     * Normalized: uiY = 1 - (y / pageH) - (height / pageH)
     */
    function screenYFromPdf(y, height, pageH) {
      return pageH - y - height;
    }

    /**
     * Convert a pdf.js text item into a UI-normalized rect (origin top-left).
     *
     * Spec metrics from getTextContent:
     *   x = item.transform[4]
     *   y = item.transform[5]
     *   width = item.width
     *   height = font size from transform (or item.height)
     *   screenY = viewportHeight - y - height
     *
     * Prefer viewport.convertToViewportRectangle when present so /Rotate is
     * honored; otherwise apply the explicit screenY formula above.
     * Returns null when there are no real glyph metrics — never invents boxes.
     */
    function itemToUiRect(item, viewport) {
      const str = String(item.str || '').trim();
      if (!str) return null;

      const t = item.transform; // [a,b,c,d,e,f] PDF user space
      if (!t || t.length < 6) return null;

      // Exact pdf.js item metrics (no guesswork).
      const x = t[4];
      const y = t[5];
      const fontH = Math.sqrt(t[2] * t[2] + t[3] * t[3]) || 0;
      const width = typeof item.width === 'number' ? item.width : 0;
      const height = fontH || (typeof item.height === 'number' ? item.height : 0);
      if (!(width > 0) || !(height > 0)) return null;

      var vx1, vy1, vx2, vy2;
      if (typeof viewport.convertToViewportRectangle === 'function') {
        // Applies scale + /Rotate; result is already top-left canvas space.
        var vr = viewport.convertToViewportRectangle([x, y, x + width, y + height]);
        vx1 = Math.min(vr[0], vr[2]);
        vy1 = Math.min(vr[1], vr[3]);
        vx2 = Math.max(vr[0], vr[2]);
        vy2 = Math.max(vr[1], vr[3]);
      } else {
        // Explicit Vision / PDFKit-style invert when convert helper is missing.
        var pageW = viewport.width / (viewport.scale || 1);
        var pageH = viewport.height / (viewport.scale || 1);
        var sx = x;
        var sy = screenYFromPdf(y, height, pageH);
        var uiX = sx / pageW;
        var uiY = sy / pageH;
        var uiW = width / pageW;
        var uiH = height / pageH;
        if (!isFinite(uiX) || !isFinite(uiY) || uiW < 0.002 || uiH < 0.002) return null;
        return {
          x: Math.min(Math.max(uiX, 0), 1),
          y: Math.min(Math.max(uiY, 0), 1),
          width: Math.min(Math.max(uiW, 0.004), 1),
          height: Math.min(Math.max(uiH, 0.008), 1)
        };
      }

      var pageWp = viewport.width;
      var pageHp = viewport.height;
      var nx = vx1 / pageWp;
      var ny = vy1 / pageHp;
      var nw = (vx2 - vx1) / pageWp;
      var nh = (vy2 - vy1) / pageHp;
      if (!isFinite(nx) || !isFinite(ny) || !isFinite(nw) || !isFinite(nh)) return null;
      if (nw < 0.002 || nh < 0.002) return null;
      nx = Math.min(Math.max(nx, 0), 1);
      ny = Math.min(Math.max(ny, 0), 1);
      nw = Math.min(Math.max(nw, 0.004), 1 - nx);
      nh = Math.min(Math.max(nh, 0.008), 1 - ny);
      return { x: nx, y: ny, width: nw, height: nh };
    }

    async function extractPageTokens(pageIndex0) {
      const page = await pdfDoc.getPage(pageIndex0 + 1);
      const viewport = pageViewport(page, 1);
      // Exact page streams — includeMarkedContent keeps tagged text intact.
      const content = await page.getTextContent({
        includeMarkedContent: true,
        disableCombineTextItems: false
      });
      const tokens = [];
      const lines = [];
      for (const item of content.items) {
        // Skip marked-content markers and empty strings — never invent boxes.
        if (!item || typeof item.str !== 'string') continue;
        if (!String(item.str).trim()) continue;
        const rect = itemToUiRect(item, viewport);
        if (!rect) continue; // no glyph metrics → no blackout box
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
