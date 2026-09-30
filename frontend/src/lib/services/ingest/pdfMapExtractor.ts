// src/lib/services/ingest/pdfMapExtractor.ts
// Automated battlemap grid detection and tile slicer for images extracted from
// adventure PDFs. Uses an off-screen Canvas element and autocorrelation of
// edge-magnitude projections to detect regular rectangular grids, then slices
// the image into equal tile data-URLs.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GridDetectResult {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  cols: number;
  rows: number;
  confidence: number;
}

export interface TileSliceResult {
  grid: GridDetectResult;
  tiles: string[];
  previewDataUrl: string;
}

export interface MapExtractOptions {
  minCellPx?: number;
  maxCellPx?: number;
  tileQuality?: number;
  preview?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function imageToCanvas(
  src: HTMLImageElement | ImageBitmap,
  scale = 1
): { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement } {
  const w = Math.round(('naturalWidth' in src ? src.naturalWidth : src.width) * scale);
  const h = Math.round(('naturalHeight' in src ? src.naturalHeight : src.height) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  return { ctx, canvas };
}

function projectEdgeMagnitude(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  axis: 'x' | 'y'
): Float32Array {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    grey[i] = 0.299 * data[base] + 0.587 * data[base + 1] + 0.114 * data[base + 2];
  }
  const size = axis === 'x' ? width : height;
  const projection = new Float32Array(size);
  if (axis === 'x') {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = 1; y < height - 1; y++) {
        sum += Math.abs(grey[(y + 1) * width + x] - grey[(y - 1) * width + x]);
      }
      projection[x] = sum / height;
    }
  } else {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = 1; x < width - 1; x++) {
        sum += Math.abs(grey[y * width + x + 1] - grey[y * width + x - 1]);
      }
      projection[y] = sum / width;
    }
  }
  return projection;
}

function dominantPeriod(
  signal: Float32Array,
  minP: number,
  maxP: number
): { period: number; offset: number; confidence: number } {
  const n = signal.length;
  let bestScore = -Infinity;
  let bestP = minP;
  for (let p = minP; p <= maxP; p++) {
    let score = 0;
    let count = 0;
    for (let i = p; i < n; i++) { score += signal[i] * signal[i - p]; count++; }
    score = count > 0 ? score / count : 0;
    if (score > bestScore) { bestScore = score; bestP = p; }
  }
  let bestOffset = 0;
  let bestPeak = -Infinity;
  for (let o = 0; o < bestP && o < n; o++) {
    if (signal[o] > bestPeak) { bestPeak = signal[o]; bestOffset = o; }
  }
  let inPhase = 0;
  let total = 0;
  let count2 = 0;
  for (let i = bestOffset; i < n; i += bestP) { inPhase += signal[i] * signal[i]; count2++; }
  for (let i = 0; i < n; i++) { total += signal[i] * signal[i]; }
  const confidence = total > 0 && count2 > 0 ? Math.min(1, (inPhase / count2) / (total / n)) : 0;
  return { period: bestP, offset: bestOffset, confidence };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function detectBattlemapGrid(
  img: HTMLImageElement | ImageBitmap,
  opts: MapExtractOptions = {}
): Promise<GridDetectResult | null> {
  const minP = opts.minCellPx ?? 20;
  const maxP = opts.maxCellPx ?? 200;
  const nativeW = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const nativeH = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, 1200 / Math.max(nativeW, nativeH));
  const { ctx } = imageToCanvas(img, scale);
  const scaledW = Math.round(nativeW * scale);
  const scaledH = Math.round(nativeH * scale);
  const imageData = ctx.getImageData(0, 0, scaledW, scaledH);
  const projX = projectEdgeMagnitude(imageData.data, scaledW, scaledH, 'x');
  const projY = projectEdgeMagnitude(imageData.data, scaledW, scaledH, 'y');
  const scaledMin = Math.round(minP * scale);
  const scaledMax = Math.round(maxP * scale);
  const rx = dominantPeriod(projX, scaledMin, scaledMax);
  const ry = dominantPeriod(projY, scaledMin, scaledMax);
  const confidence = (rx.confidence + ry.confidence) / 2;
  if (confidence < 0.2) return null;
  const cellPxScaled = rx.confidence >= ry.confidence ? rx.period : ry.period;
  const cellPx = Math.round(cellPxScaled / scale);
  const offsetX = Math.round(rx.offset / scale);
  const offsetY = Math.round(ry.offset / scale);
  const cols = Math.floor((nativeW - offsetX) / cellPx);
  const rows = Math.floor((nativeH - offsetY) / cellPx);
  return { cellPx, offsetX, offsetY, cols, rows, confidence };
}

export async function sliceBattlemapTiles(
  img: HTMLImageElement | ImageBitmap,
  grid: GridDetectResult,
  opts: MapExtractOptions = {}
): Promise<TileSliceResult> {
  const quality = opts.tileQuality ?? 0.88;
  const { canvas: srcCanvas } = imageToCanvas(img);
  const tiles: string[] = [];
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = grid.cellPx;
  tileCanvas.height = grid.cellPx;
  const tileCtx = tileCanvas.getContext('2d')!;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const sx = grid.offsetX + col * grid.cellPx;
      const sy = grid.offsetY + row * grid.cellPx;
      tileCtx.clearRect(0, 0, grid.cellPx, grid.cellPx);
      tileCtx.drawImage(srcCanvas, sx, sy, grid.cellPx, grid.cellPx, 0, 0, grid.cellPx, grid.cellPx);
      tiles.push(tileCanvas.toDataURL('image/jpeg', quality));
    }
  }
  let previewDataUrl = '';
  if (opts.preview !== false) {
    const { canvas: pvCanvas, ctx: pvCtx } = imageToCanvas(img, 0.5);
    const s = 0.5;
    pvCtx.strokeStyle = 'rgba(0,200,255,0.7)';
    pvCtx.lineWidth = 1;
    for (let col = 0; col <= grid.cols; col++) {
      const x = (grid.offsetX + col * grid.cellPx) * s;
      pvCtx.beginPath();
      pvCtx.moveTo(x, grid.offsetY * s);
      pvCtx.lineTo(x, (grid.offsetY + grid.rows * grid.cellPx) * s);
      pvCtx.stroke();
    }
    for (let row = 0; row <= grid.rows; row++) {
      const y = (grid.offsetY + row * grid.cellPx) * s;
      pvCtx.beginPath();
      pvCtx.moveTo(grid.offsetX * s, y);
      pvCtx.lineTo((grid.offsetX + grid.cols * grid.cellPx) * s, y);
      pvCtx.stroke();
    }
    previewDataUrl = pvCanvas.toDataURL('image/jpeg', 0.75);
  }
  return { grid, tiles, previewDataUrl };
}

export async function extractMapFromDataUrl(
  dataUrl: string,
  opts: MapExtractOptions = {}
): Promise<TileSliceResult | null> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const grid = await detectBattlemapGrid(img, opts);
        if (!grid) { resolve(null); return; }
        resolve(await sliceBattlemapTiles(img, grid, opts));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
