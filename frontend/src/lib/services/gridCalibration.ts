// src/lib/services/gridCalibration.ts
// 3-Point Calibration Math Service (Zero Dependencies)

export interface CalibrationPoints {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  gridUnitsWide: number;
  gridUnitsHigh: number;
}

export interface GridConfig {
  pixelsPerSquare: number;
  offsetX: number;
  offsetY: number;
}

export function computeGridCalibration(points: CalibrationPoints): GridConfig {
  const pixelWidth = Math.abs(points.p2.x - points.p1.x);
  const pixelHeight = Math.abs(points.p2.y - points.p1.y);

  const ppx = pixelWidth / Math.max(1, points.gridUnitsWide);
  const ppy = pixelHeight / Math.max(1, points.gridUnitsHigh);
  const pixelsPerSquare = Math.max(10, Math.round((ppx + ppy) / 2));

  const offsetX = points.p1.x % pixelsPerSquare;
  const offsetY = points.p1.y % pixelsPerSquare;

  return { pixelsPerSquare, offsetX, offsetY };
}
