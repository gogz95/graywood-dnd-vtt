// frontend/src/lib/canvas/viewportEngine.ts
// Physical TV 1-Inch Scale Calculator & Viewport Zoom Engine

/**
 * Calculates physical pixels-per-inch (PPI) from display resolution and diagonal in inches:
 * PPI = sqrt(width^2 + height^2) / diagonal
 */
export function calculatePhysicalPpi(
  widthPx: number,
  heightPx: number,
  diagonalInches: number
): number {
  if (diagonalInches <= 0 || widthPx <= 0 || heightPx <= 0) {
    return 96;
  }
  const diagonalPx = Math.sqrt(widthPx * widthPx + heightPx * heightPx);
  return Math.round((diagonalPx / diagonalInches) * 100) / 100;
}

/**
 * Calculates the exact canvas zoom ratio required to render each tactical 5ft grid cell
 * at exactly 1.0 real-world physical inch (25.4mm) on the display glass:
 * Zoom = physicalPpi / gridSize
 */
export function calculateOneInchScaleZoom(
  physicalPpi: number,
  gridSize: number
): number {
  if (gridSize <= 0) return 1.0;
  const ppi = Math.max(20, Math.min(400, physicalPpi));
  return ppi / gridSize;
}

/**
 * Computes viewport translation so a designated world focal point (e.g. active token)
 * remains stationary at screen center during zoom adjustment:
 */
export function lockViewportToPhysicalScale(
  currentVp: { x: number; y: number; zoom: number },
  screenWidthPx: number,
  screenHeightPx: number,
  physicalPpi: number,
  gridSize: number
): { x: number; y: number; zoom: number } {
  const targetZoom = calculateOneInchScaleZoom(physicalPpi, gridSize);

  // Compute world coordinates at current screen center
  const centerWorldX = (screenWidthPx * 0.5 - currentVp.x) / currentVp.zoom;
  const centerWorldY = (screenHeightPx * 0.5 - currentVp.y) / currentVp.zoom;

  // New viewport offsets to keep world center aligned
  const nextX = screenWidthPx * 0.5 - centerWorldX * targetZoom;
  const nextY = screenHeightPx * 0.5 - centerWorldY * targetZoom;

  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    zoom: targetZoom,
  };
}
