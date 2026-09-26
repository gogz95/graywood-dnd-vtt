// frontend/src/lib/canvas/math/distance5e.ts
// Pure headless 5e distance calculator with 3D elevation support.
// Zero UI/PixiJS/browser imports.

export type DiagonalRule = '5-10-5' | 'euclidean' | 'manhattan' | '5-5-5';

export interface Point3D {
  x: number;
  y: number;
  elevation: number;
}

export interface DistanceCalculationOptions {
  from: Point3D;
  to: Point3D;
  cellSize: number;
  feetPerCell: number;
  diagonalRule: DiagonalRule;
}

export interface DistanceResult {
  distance2D: number;
  distance3D: number;
  elevationDelta: number;
  cellsTraversed: number;
}

/**
 * Computes 2D grid distance in feet based on the selected diagonal rule.
 * Cell deltas are in integer cell units.
 */
function compute2DFeet(
  dx: number,
  dy: number,
  feetPerCell: number,
  diagonalRule: DiagonalRule,
): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  switch (diagonalRule) {
    case '5-5-5': {
      // Chebyshev: diagonal counts as 1 cell (5ft)
      const cells = Math.max(ax, ay);
      return cells * feetPerCell;
    }

    case '5-10-5': {
      // Alternating diagonal cost: 1st diag = 5ft, 2nd = 10ft, 3rd = 5ft, …
      // Straight moves cost 5ft each, diagonals alternate 5/10
      const straight = Math.abs(ax - ay);
      const diagonals = Math.min(ax, ay);
      const straightFeet = straight * feetPerCell;

      // Alternating cumulative: each pair of diagonals costs (5+10) = 15ft
      // For n diagonals: floor(n/2)*15 + (n%2)*5
      const diagPairs = Math.floor(diagonals / 2);
      const diagRemainder = diagonals % 2;
      const diagFeet = diagPairs * (feetPerCell + feetPerCell * 2) + diagRemainder * feetPerCell;

      return straightFeet + diagFeet;
    }

    case 'euclidean': {
      // Continuous Euclidean distance in cell units, scaled to feet
      return Math.sqrt(ax * ax + ay * ay) * feetPerCell;
    }

    case 'manhattan': {
      // Manhattan (axis sum): each axis step costs feetPerCell
      return (ax + ay) * feetPerCell;
    }
  }
}

/**
 * Calculates 5e-accurate distance between two 3D points on a VTT grid.
 * Supports alternating diagonal rules, Chebyshev, Euclidean, and Manhattan distance.
 */
export function calculate5eDistance(opts: DistanceCalculationOptions): DistanceResult {
  const { from, to, cellSize, feetPerCell, diagonalRule } = opts;

  // Convert world coordinates to fractional cell deltas
  const dxCells = (to.x - from.x) / cellSize;
  const dyCells = (to.y - from.y) / cellSize;
  const elevationDelta = Math.abs(to.elevation - from.elevation);

  const distance2D = compute2DFeet(dxCells, dyCells, feetPerCell, diagonalRule);
  const distance3D = Math.round(Math.sqrt(distance2D * distance2D + elevationDelta * elevationDelta) * 10) / 10;

  const cellsTraversed = diagonalRule === 'euclidean'
    ? Math.round(Math.sqrt(dxCells * dxCells + dyCells * dyCells) * 10) / 10
    : Math.max(Math.abs(dxCells), Math.abs(dyCells));

  return {
    distance2D,
    distance3D,
    elevationDelta,
    cellsTraversed,
  };
}

/**
 * Convenience: compute feet between two Point3D values with explicit rule.
 */
export function feetBetween(
  from: Point3D,
  to: Point3D,
  diagonalRule: DiagonalRule = '5-5-5',
  cellSize: number = 100,
  feetPerCell: number = 5,
): number {
  return calculate5eDistance({ from, to, cellSize, feetPerCell, diagonalRule }).distance3D;
}
