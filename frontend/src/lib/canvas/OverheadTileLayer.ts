// frontend/src/lib/canvas/OverheadTileLayer.ts
// Overhead Canopy & Building Roof Occlusion Engine with Smooth Frame Lerping
// Fades roof tiles to 0.20 alpha when tokens walk underneath, restoring to 1.0 when tokens exit.

export interface OverheadRoofTile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  polygon?: Array<{ x: number; y: number }>; // Optional exact polygonal roof footprint
  image?: HTMLImageElement | null;
  imageUrl?: string;
  currentOpacity: number; // Current dynamic alpha state
  baseOpacity?: number; // Default 1.0
  occludedOpacity?: number; // Target alpha when tokens are inside (default 0.20)
  fadeSpeed?: number; // Lerp speed multiplier (default 6.0)
}

/**
 * Tests whether a point (px, py) is inside a 2D polygon using Ray-Casting algorithm.
 */
export function isPointInPolygon(
  px: number,
  py: number,
  polygon: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if a token center or bounding box overlaps an overhead roof tile.
 */
export function isTokenUnderRoof(
  token: { x: number; y: number; sizeInCells?: number; isVisible?: boolean },
  tile: OverheadRoofTile,
  gridSize: number
): boolean {
  if (token.isVisible === false) return false;

  const size = (token.sizeInCells || 1) * gridSize;
  const tokCenterX = token.x * gridSize + size / 2;
  const tokCenterY = token.y * gridSize + size / 2;

  // Polygonal precision check if custom polygon boundary is defined
  if (tile.polygon && tile.polygon.length >= 3) {
    return isPointInPolygon(tokCenterX, tokCenterY, tile.polygon);
  }

  // AABB bounding box check
  return (
    tokCenterX >= tile.x &&
    tokCenterX <= tile.x + tile.width &&
    tokCenterY >= tile.y &&
    tokCenterY <= tile.y + tile.height
  );
}

/**
 * Updates dynamic alpha transitions for all roof tiles via framerate-independent exponential lerp:
 * alpha(t + dt) = lerp(alpha, targetAlpha, 1 - exp(-speed * dt))
 */
export function updateRoofTileOpacities(
  tiles: OverheadRoofTile[],
  tokens: Array<{ x: number; y: number; sizeInCells?: number; isVisible?: boolean }>,
  gridSize: number,
  dtSeconds: number = 0.016
): void {
  for (const tile of tiles) {
    const isOccupied = tokens.some((tok) => isTokenUnderRoof(tok, tile, gridSize));

    const targetAlpha = isOccupied
      ? tile.occludedOpacity ?? 0.20
      : tile.baseOpacity ?? 1.0;

    const speed = tile.fadeSpeed ?? 6.0;
    const t = 1.0 - Math.exp(-speed * dtSeconds);

    tile.currentOpacity = tile.currentOpacity + (targetAlpha - tile.currentOpacity) * t;

    // Snap to target if within microscopic delta
    if (Math.abs(tile.currentOpacity - targetAlpha) < 0.005) {
      tile.currentOpacity = targetAlpha;
    }
  }
}

/**
 * Renders overhead roof canopy tiles with their current dynamic opacity.
 */
export function renderOverheadRoofCanopy(
  ctx: CanvasRenderingContext2D,
  tiles: OverheadRoofTile[]
): void {
  if (!tiles || tiles.length === 0) return;

  ctx.save();
  for (const tile of tiles) {
    ctx.globalAlpha = Math.max(0.05, Math.min(1.0, tile.currentOpacity));

    if (tile.image && tile.image.complete && tile.image.naturalWidth > 0) {
      ctx.drawImage(tile.image, tile.x, tile.y, tile.width, tile.height);
    } else {
      // Atmospheric fallback structural rendering
      ctx.fillStyle = 'rgba(51, 65, 85, 0.95)';
      ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tile.x, tile.y, tile.width, tile.height);
    }
  }
  ctx.restore();
}
