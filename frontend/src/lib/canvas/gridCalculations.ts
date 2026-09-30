// frontend/src/lib/canvas/gridCalculations.ts
// Hexagonal & Square Grid Coordinate Mathematics and Snap-to-Grid Utilities
// Supports axial/cube representations and flat-topped / pointy-topped regular hexagons.

export type HexOrientation = 'flat' | 'pointy' | 'hex_flat' | 'hex_pointy';

export interface AxialCoord {
  q: number;
  r: number;
}

export interface CubeCoord {
  q: number;
  r: number;
  s: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Normalizes hex orientation string to 'flat' or 'pointy'.
 */
export function normalizeHexOrientation(orientation: HexOrientation): 'flat' | 'pointy' {
  if (orientation === 'pointy' || orientation === 'hex_pointy') {
    return 'pointy';
  }
  return 'flat';
}

/**
 * Converts axial coordinates (q, r) to cube coordinates (q, r, s).
 * Satisfies identity: q + r + s = 0.
 */
export function axialToCube(axial: AxialCoord): CubeCoord {
  return {
    q: axial.q,
    r: axial.r,
    s: -axial.q - axial.r,
  };
}

/**
 * Converts cube coordinates (q, r, s) to axial coordinates (q, r).
 */
export function cubeToAxial(cube: CubeCoord): AxialCoord {
  return {
    q: cube.q,
    r: cube.r,
  };
}

/**
 * Rounds fractional floating-point cube coordinates to the nearest discrete integer cube coordinate.
 */
export function cubeRound(cube: CubeCoord): CubeCoord {
  let q = Math.round(cube.q);
  let r = Math.round(cube.r);
  let s = Math.round(cube.s);

  const qDiff = Math.abs(q - cube.q);
  const rDiff = Math.abs(r - cube.r);
  const sDiff = Math.abs(s - cube.s);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  } else {
    s = -q - r;
  }

  return { q, r, s };
}

/**
 * Converts 2D pixel coordinates (x, y) to fractional axial coordinates (q, r).
 * @param x Pixel x coordinate relative to grid origin
 * @param y Pixel y coordinate relative to grid origin
 * @param radius Circumradius of the regular hexagon (distance from center to any vertex)
 * @param orientation 'flat' (flat-topped) or 'pointy' (pointy-topped)
 */
export function pixelToHexAxial(
  x: number,
  y: number,
  radius: number,
  orientation: HexOrientation = 'pointy',
): AxialCoord {
  const norm = normalizeHexOrientation(orientation);
  if (norm === 'pointy') {
    // Pointy-topped:
    // x = radius * sqrt(3) * (q + r/2)
    // y = radius * 3/2 * r
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / radius;
    const r = ((2 / 3) * y) / radius;
    return { q, r };
  } else {
    // Flat-topped:
    // x = radius * 3/2 * q
    // y = radius * sqrt(3) * (r + q/2)
    const q = ((2 / 3) * x) / radius;
    const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / radius;
    return { q, r };
  }
}

/**
 * Converts discrete axial coordinates (q, r) to pixel center coordinates (x, y).
 */
export function hexAxialToPixel(
  q: number,
  r: number,
  radius: number,
  orientation: HexOrientation = 'pointy',
): Point2D {
  const norm = normalizeHexOrientation(orientation);
  if (norm === 'pointy') {
    const x = radius * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = radius * ((3 / 2) * r);
    return { x, y };
  } else {
    const x = radius * ((3 / 2) * q);
    const y = radius * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
    return { x, y };
  }
}

/**
 * Hex snap-to-grid utility:
 * Converts arbitrary pixel coordinates (x, y) to the exact pixel center coordinates of the nearest hex cell.
 */
export function snapToHex(
  x: number,
  y: number,
  radius: number,
  orientation: HexOrientation = 'pointy',
  offsetX: number = 0,
  offsetY: number = 0,
): Point2D & { q: number; r: number } {
  const relX = x - offsetX;
  const relY = y - offsetY;
  const fracAxial = pixelToHexAxial(relX, relY, radius, orientation);
  const roundedCube = cubeRound(axialToCube(fracAxial));
  const axial = cubeToAxial(roundedCube);
  const centerPixel = hexAxialToPixel(axial.q, axial.r, radius, orientation);

  return {
    x: centerPixel.x + offsetX,
    y: centerPixel.y + offsetY,
    q: axial.q,
    r: axial.r,
  };
}

/**
 * Calculates Manhattan distance between two hexes in cube coordinates:
 * max(|q1 - q2|, |r1 - r2|, |s1 - s2|).
 */
export function hexDistance(
  a: AxialCoord | CubeCoord,
  b: AxialCoord | CubeCoord,
): number {
  const cubeA = 's' in a ? (a as CubeCoord) : axialToCube(a as AxialCoord);
  const cubeB = 's' in b ? (b as CubeCoord) : axialToCube(b as AxialCoord);

  return Math.max(
    Math.abs(cubeA.q - cubeB.q),
    Math.abs(cubeA.r - cubeB.r),
    Math.abs(cubeA.s - cubeB.s),
  );
}

/**
 * Calculates distance in feet between two hex cells given grid unit scale (default 5ft per cell).
 */
export function hexDistanceFeet(
  a: AxialCoord | CubeCoord,
  b: AxialCoord | CubeCoord,
  feetPerHex: number = 5,
): number {
  return hexDistance(a, b) * feetPerHex;
}

/**
 * Computes the 6 polygon vertices of a regular hexagon centered at (cx, cy).
 */
export function getHexVertices(
  cx: number,
  cy: number,
  radius: number,
  orientation: HexOrientation = 'pointy',
): Point2D[] {
  const norm = normalizeHexOrientation(orientation);
  const angleOffset = norm === 'pointy' ? Math.PI / 6 : 0; // 30 deg for pointy, 0 deg for flat
  const vertices: Point2D[] = [];

  for (let i = 0; i < 6; i++) {
    const angle = angleOffset + (i * Math.PI) / 3;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return vertices;
}
