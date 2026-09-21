// src/lib/canvas/layerStack.ts
// Discrete Multi-Layer Canvas Stack & Overhead Canopy Punch-Through Engine
// Render Pass Order:
// 1. BackgroundLayer (Base map texture)
// 2. GridLayer (Dynamic square/hex grid with opacity/color)
// 3. DrawingsLayer (Freehand and geometric shapes)
// 4. TokenLayer (Active tokens, elevation badges, orbit rings, distance auras)
// 5. OverheadTileLayer (Roofs, treetops with 0.2 alpha punch-through when token is underneath)
// 6. DmSecretLayer (Traps, patrol paths, GM notes — DM workstation ONLY)
// 7. WeatherFxLayer (Fullscreen procedural rain, snow, fog particles via blend modes)

import type { CanvasToken, ViewportTransform } from '../../stores/canvasStore.svelte';

export type CanvasLayerName =
  | 'BackgroundLayer'
  | 'GridLayer'
  | 'DrawingsLayer'
  | 'TokenLayer'
  | 'OverheadTileLayer'
  | 'DmSecretLayer'
  | 'WeatherFxLayer';

export const CANVAS_RENDER_PASS_ORDER: readonly CanvasLayerName[] = [
  'BackgroundLayer',
  'GridLayer',
  'DrawingsLayer',
  'TokenLayer',
  'OverheadTileLayer',
  'DmSecretLayer',
  'WeatherFxLayer',
] as const;

export interface OverheadTile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl?: string;
  image?: HTMLImageElement | null;
  baseOpacity?: number;
  alphaPunchOpacity?: number; // default 0.2
}

export interface DmSecretItem {
  id: string;
  type: 'trap' | 'patrol_path' | 'gm_note';
  x: number;
  y: number;
  label: string;
  details?: string;
  points?: Array<{ x: number; y: number }>;
}

export interface DrawingShape {
  id: string;
  type: 'freehand' | 'rectangle' | 'circle' | 'polygon';
  points: Array<{ x: number; y: number }>;
  strokeColor: string;
  fillColor?: string;
  lineWidth: number;
}

export interface WeatherFxConfig {
  type: 'none' | 'rain' | 'snow' | 'fog';
  intensity: number; // 0.0 to 1.0
  speed: number;
  windAngle?: number;
}

export interface LayerStackRenderContext {
  ctx: CanvasRenderingContext2D;
  viewport: ViewportTransform;
  canvasWidth: number;
  canvasHeight: number;
  isDm: boolean;
  gridSize: number;
  gridOpacity: number;
  gridColor?: string;
  gridType?: 'square' | 'hex-h' | 'hex-v' | 'gridless';
  mapImage?: HTMLImageElement | null;
  tokens: CanvasToken[];
  overheadTiles: OverheadTile[];
  dmSecrets: DmSecretItem[];
  drawings: DrawingShape[];
  weather: WeatherFxConfig;
  timeMs: number;
}

/**
 * Checks whether any visible token's bounding box overlaps with an overhead canopy tile.
 */
export function isTokenUnderTile(token: CanvasToken, tile: OverheadTile, gridSize: number): boolean {
  const tokX = token.x * gridSize;
  const tokY = token.y * gridSize;
  const tokSize = (token.sizeInCells || 1) * gridSize;

  return (
    tokX + tokSize > tile.x &&
    tokX < tile.x + tile.width &&
    tokY + tokSize > tile.y &&
    tokY < tile.y + tile.height
  );
}

/**
 * 1. Background Layer: Draws base map image
 */
export function renderBackgroundLayer(rc: LayerStackRenderContext): void {
  if (!rc.mapImage) return;
  rc.ctx.drawImage(rc.mapImage, 0, 0);
}

/**
 * 2. Grid Layer: Dynamic square or hex grid
 */
export function renderGridLayer(rc: LayerStackRenderContext): void {
  const { ctx, viewport: vp, gridSize, gridOpacity, gridColor, canvasWidth: w, canvasHeight: h } = rc;
  if (gridOpacity <= 0 || !gridSize) return;

  ctx.save();
  ctx.strokeStyle = gridColor || `rgba(99, 102, 241, ${gridOpacity * 0.75})`;
  ctx.lineWidth = 0.6 / vp.zoom;

  const startCol = Math.floor(-vp.x / vp.zoom / gridSize) - 1;
  const startRow = Math.floor(-vp.y / vp.zoom / gridSize) - 1;
  const cols = Math.ceil(w / vp.zoom / gridSize) + 2;
  const rows = Math.ceil(h / vp.zoom / gridSize) + 2;

  for (let c = startCol; c <= startCol + cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * gridSize, startRow * gridSize);
    ctx.lineTo(c * gridSize, (startRow + rows) * gridSize);
    ctx.stroke();
  }
  for (let r = startRow; r <= startRow + rows; r++) {
    ctx.beginPath();
    ctx.moveTo(startCol * gridSize, r * gridSize);
    ctx.lineTo((startCol + cols) * gridSize, r * gridSize);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 3. Drawings Layer: Freehand and geometric annotations
 */
export function renderDrawingsLayer(rc: LayerStackRenderContext): void {
  const { ctx, drawings } = rc;
  if (!drawings || drawings.length === 0) return;

  ctx.save();
  for (const d of drawings) {
    if (!d.points || d.points.length === 0) continue;
    ctx.strokeStyle = d.strokeColor || '#fbbf24';
    ctx.lineWidth = d.lineWidth || 2;
    if (d.fillColor) ctx.fillStyle = d.fillColor;

    ctx.beginPath();
    ctx.moveTo(d.points[0].x, d.points[0].y);
    for (let i = 1; i < d.points.length; i++) {
      ctx.lineTo(d.points[i].x, d.points[i].y);
    }
    if (d.type === 'polygon' || d.type === 'rectangle' || d.type === 'circle') {
      ctx.closePath();
      if (d.fillColor) ctx.fill();
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 4. Overhead Tile Layer: Structural roofs and treetops with alpha punch-through
 */
export function renderOverheadTileLayer(rc: LayerStackRenderContext): void {
  const { ctx, overheadTiles, tokens, gridSize } = rc;
  if (!overheadTiles || overheadTiles.length === 0) return;

  ctx.save();
  for (const tile of overheadTiles) {
    const isUnder = tokens.some(t => isTokenUnderTile(t, tile, gridSize));
    const targetAlpha = isUnder ? (tile.alphaPunchOpacity ?? 0.2) : (tile.baseOpacity ?? 1.0);

    ctx.globalAlpha = targetAlpha;
    if (tile.image && tile.image.complete) {
      ctx.drawImage(tile.image, tile.x, tile.y, tile.width, tile.height);
    } else {
      ctx.fillStyle = 'rgba(71, 85, 105, 0.8)';
      ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(tile.x, tile.y, tile.width, tile.height);
    }
  }
  ctx.restore();
}

/**
 * 5. DM Secret Layer: Hidden traps, patrol paths, GM notes (rendered ONLY on DM workstation)
 */
export function renderDmSecretLayer(rc: LayerStackRenderContext): void {
  if (!rc.isDm || !rc.dmSecrets || rc.dmSecrets.length === 0) return;

  const { ctx } = rc;
  ctx.save();

  for (const sec of rc.dmSecrets) {
    if (sec.type === 'trap') {
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sec.x, sec.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`⚠️ ${sec.label}`, sec.x + 20, sec.y + 4);
    } else if (sec.type === 'patrol_path' && sec.points && sec.points.length > 1) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sec.points[0].x, sec.points[0].y);
      for (let i = 1; i < sec.points.length; i++) {
        ctx.lineTo(sec.points[i].x, sec.points[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (sec.type === 'gm_note') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.fillRect(sec.x - 8, sec.y - 8, 16, 16);
      ctx.strokeRect(sec.x - 8, sec.y - 8, 16, 16);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('📝', sec.x - 6, sec.y + 4);
    }
  }

  ctx.restore();
}

/**
 * 6. Weather FX Layer: Fullscreen procedural rain, snow, fog particles
 */
export function renderWeatherFxLayer(rc: LayerStackRenderContext): void {
  const { ctx, weather, canvasWidth: w, canvasHeight: h, timeMs } = rc;
  if (!weather || weather.type === 'none' || weather.intensity <= 0) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Screen space overlay

  if (weather.type === 'rain') {
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
    ctx.lineWidth = 1;
    const dropCount = Math.floor(150 * weather.intensity);
    const speed = (weather.speed || 1) * 25;

    for (let i = 0; i < dropCount; i++) {
      const rx = (Math.sin(i * 997 + timeMs * 0.001) * 0.5 + 0.5) * w;
      const ry = ((i * 47 + timeMs * 0.5 * speed) % h);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 3, ry + 12);
      ctx.stroke();
    }
  } else if (weather.type === 'snow') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    const flakeCount = Math.floor(120 * weather.intensity);
    const speed = (weather.speed || 1) * 8;

    for (let i = 0; i < flakeCount; i++) {
      const sx = (Math.sin(i * 533 + timeMs * 0.0005) * 0.5 + 0.5) * w + Math.sin(timeMs * 0.002 + i) * 15;
      const sy = ((i * 31 + timeMs * 0.1 * speed) % h);
      const r = (i % 3) + 1;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (weather.type === 'fog') {
    ctx.fillStyle = `rgba(226, 232, 240, ${0.18 * weather.intensity})`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}

/**
 * Master Canvas Render Loop executing all 7 layers in strict order.
 */
export function executeLayerStackRender(rc: LayerStackRenderContext, renderTokenLayerCallback?: () => void): void {
  renderBackgroundLayer(rc);
  renderGridLayer(rc);
  renderDrawingsLayer(rc);

  if (renderTokenLayerCallback) {
    renderTokenLayerCallback();
  }

  renderOverheadTileLayer(rc);
  renderDmSecretLayer(rc);
  renderWeatherFxLayer(rc);
}
