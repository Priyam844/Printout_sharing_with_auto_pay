import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source for browser environment
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

/**
 * Load PDF document from File, Blob, or URL
 */
export async function loadPdfDocument(source) {
  let loadingTask;
  if (source instanceof File || source instanceof Blob) {
    const arrayBuffer = await source.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      isEvalSupported: false,
    });
  } else if (typeof source === 'string') {
    loadingTask = pdfjsLib.getDocument({
      url: source,
      isEvalSupported: false,
    });
  } else {
    throw new Error('Unsupported PDF source');
  }
  return await loadingTask.promise;
}

/**
 * Render a single page of PDF into a target canvas element
 */
export async function renderPdfPageToCanvas(pdfDoc, pageNumber, canvas, options = {}) {
  if (!pdfDoc || !canvas) return;

  const page = await pdfDoc.getPage(pageNumber);
  const targetWidth = options.width || 450;
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(outputScale, outputScale);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };

  const renderTask = page.render(renderContext);
  await renderTask.promise;
  ctx.restore();
  return renderTask;
}

/**
 * Parse page_range string (e.g., '1-5, 7, 9-11') into an array of page numbers
 */
export function parsePageRange(rangeStr, maxPages = 1) {
  if (!rangeStr || !rangeStr.trim()) {
    return Array.from({ length: Math.max(1, maxPages) }, (_, i) => i + 1);
  }

  const pages = new Set();
  const parts = rangeStr.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let p = Math.max(1, start); p <= Math.min(end, maxPages || 9999); p++) {
          pages.add(p);
        }
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p >= 1 && p <= (maxPages || 9999)) {
        pages.add(p);
      }
    }
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : Array.from({ length: Math.max(1, maxPages) }, (_, i) => i + 1);
}
