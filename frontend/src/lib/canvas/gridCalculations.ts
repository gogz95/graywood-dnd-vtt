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

  return {
    q: q === 0 ? 0 : q,
    r: r === 0 ? 0 : r,
    s: s === 0 ? 0 : s,
  };
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

/**
 * Square snap-to-grid utility:
 * Snaps pixel coordinates (x, y) to the nearest discrete square cell center or top-left.
 */
export function snapToSquareGrid(
  x: number,
  y: number,
  cellSize: number,
  center: boolean = true,
  offsetX: number = 0,
  offsetY: number = 0,
): Point2D & { gx: number; gy: number } {
  const relX = x - offsetX;
  const relY = y - offsetY;
  const gx = Math.floor(relX / cellSize);
  const gy = Math.floor(relY / cellSize);
  const snapOffset = center ? cellSize / 2 : 0;

  return {
    x: gx * cellSize + snapOffset + offsetX,
    y: gy * cellSize + snapOffset + offsetY,
    gx,
    gy,
  };
}

/**
 * Universal snap utility routing token coordinate snaps based on active scene gridType.
 */
export function snapByGridType(
  x: number,
  y: number,
  gridSize: number,
  gridType: 'square' | 'hex_pointy' | 'hex_flat' | 'gridless',
  center: boolean = true,
  offsetX: number = 0,
  offsetY: number = 0,
): Point2D & { gx: number; gy: number } {
  if (gridType === 'gridless') {
    return {
      x,
      y,
      gx: Math.floor(x / gridSize),
      gy: Math.floor(y / gridSize),
    };
  }

  if (gridType === 'hex_pointy' || gridType === 'hex_flat') {
    const orientation = gridType === 'hex_pointy' ? 'pointy' : 'flat';
    const radius = gridSize / Math.sqrt(3);
    const hex = snapToHex(x, y, radius, orientation, offsetX, offsetY);
    return {
      x: hex.x,
      y: hex.y,
      gx: hex.q,
      gy: hex.r,
    };
  }

  return snapToSquareGrid(x, y, gridSize, center, offsetX, offsetY);
}

// ═════════════════════════════════════════════════════════════════════════════
// HEX-PERFECT AOE SPELL TEMPLATES (Adapted from flauwekeul/honeycomb)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Computes all hexes exactly at distance radius from center (q, r).
 */
export function getHexRing(center: AxialCoord, radius: number): AxialCoord[] {
  if (radius <= 0) return [center];

  const results: AxialCoord[] = [];
  // Cube directions
  const directions = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 },
  ];

  const centerCube = axialToCube(center);
  // Start at center + direction[4] * radius
  let currentCube: CubeCoord = {
    q: centerCube.q + directions[4].q * radius,
    r: centerCube.r + directions[4].r * radius,
    s: centerCube.s + directions[4].s * radius,
  };

  for (let i = 0; i < 6; i++) {
    for (let step = 0; step < radius; step++) {
      results.push(cubeToAxial(currentCube));
      currentCube = {
        q: currentCube.q + directions[i].q,
        r: currentCube.r + directions[i].r,
        s: currentCube.s + directions[i].s,
      };
    }
  }

  return results;
}

/**
 * Computes all discrete hex cells within distance <= radius from center (q, r).
 * Generates circular spell burst areas without fractional cell clipping.
 */
export function getHexSpiral(center: AxialCoord, radius: number): AxialCoord[] {
  const results: AxialCoord[] = [center];
  for (let k = 1; k <= radius; k++) {
    results.push(...getHexRing(center, k));
  }
  return results;
}

/**
 * Computes the discrete hex cells enclosed by a 60-degree wedge cone given an origin hex,
 * target direction angle theta (in radians), and radius in hex cells.
 */
export function getHexCone(
  origin: AxialCoord,
  theta: number,
  radius: number,
  orientation: HexOrientation = 'pointy'
): AxialCoord[] {
  if (radius <= 0) return [origin];

  const hexRadius = 1; // Normalized coordinate distance
  const allInRange = getHexSpiral(origin, radius);
  const coneHalfAngle = Math.PI / 6; // 30 degrees either side -> 60-degree cone wedge

  const originPx = hexAxialToPixel(origin.q, origin.r, hexRadius, orientation);

  return allInRange.filter((hex) => {
    if (hex.q === origin.q && hex.r === origin.r) return true;
    const targetPx = hexAxialToPixel(hex.q, hex.r, hexRadius, orientation);
    const angle = Math.atan2(targetPx.y - originPx.y, targetPx.x - originPx.x);
    // Angular difference normalized between -PI and PI
    let diff = angle - theta;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff) <= coneHalfAngle + 0.05;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CUBE COORDINATE LINE INTERPOLATION & HEX COVER RAYCAST (flauwekeul/honeycomb)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Linear interpolation between two cube coordinates at normalized step t (0.0 to 1.0).
 */
export function cubeLerp(a: CubeCoord, b: CubeCoord, t: number): CubeCoord {
  return {
    q: a.q + (b.q - a.q) * t,
    r: a.r + (b.r - a.r) * t,
    s: a.s + (b.s - a.s) * t,
  };
}

/**
 * Draws a discrete Bresenham-style straight line of hexes between two cube coordinates.
 * Employs a microscopic nudge epsilon to ensure deterministic boundary rounding.
 */
export function cubeLinedraw(a: CubeCoord, b: CubeCoord): CubeCoord[] {
  const dist = Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s)
  );
  if (dist === 0) return [cubeRound(a)];

  const results: CubeCoord[] = [];
  const aNudge: CubeCoord = { q: a.q + 1e-6, r: a.r + 1e-6, s: a.s - 2e-6 };
  const bNudge: CubeCoord = { q: b.q + 1e-6, r: b.r + 1e-6, s: b.s - 2e-6 };

  for (let i = 0; i <= dist; i++) {
    const t = i / dist;
    results.push(cubeRound(cubeLerp(aNudge, bNudge, t)));
  }
  return results;
}

export type HexCoverType = 'none' | 'half' | 'three-quarters' | 'total';

export interface HexCoverResult {
  coverType: HexCoverType;
  acBonus: number;
  dexSaveBonus: number;
  blockedHexCount: number;
  interveningCount: number;
  canTarget: boolean;
  description: string;
}

/**
 * Calculates 5e SRD cover across hexagonal grids between attacker and defender hexes.
 * Uses cube coordinate line interpolation to trace line of sight across intervening obstacles and tokens:
 * - 0 intervening obstacles/tokens: None (+0 AC)
 * - 1 intervening obstacle or creature token: Half Cover (+2 AC, +2 DEX saves)
 * - 2+ intervening obstacles or heavy colliders: Three-Quarters Cover (+5 AC, +5 DEX saves)
 * - Total obstruction: Total Cover (Cannot be targeted)
 */
export function calculateHexCover(
  attacker: AxialCoord,
  defender: AxialCoord,
  obstacles: AxialCoord[] = [],
  tokens: AxialCoord[] = []
): HexCoverResult {
  const attackerCube = axialToCube(attacker);
  const defenderCube = axialToCube(defender);

  const lineHexes = cubeLinedraw(attackerCube, defenderCube);

  // If adjacent or same cell, no intervening cover possible
  if (lineHexes.length <= 2) {
    return {
      coverType: 'none',
      acBonus: 0,
      dexSaveBonus: 0,
      blockedHexCount: 0,
      interveningCount: 0,
      canTarget: true,
      description: 'Clear line of sight (no intervening hexes)',
    };
  }

  // Intervening cells (excluding attacker at index 0 and defender at last index)
  const intervening = lineHexes.slice(1, -1);
  const obstacleKeys = new Set(obstacles.map((o) => `${o.q},${o.r}`));
  const tokenKeys = new Set(tokens.map((t) => `${t.q},${t.r}`));

  let blockedHexCount = 0;
  for (const hex of intervening) {
    const key = `${hex.q},${hex.r}`;
    if (obstacleKeys.has(key) || tokenKeys.has(key)) {
      blockedHexCount++;
    }
  }

  if (blockedHexCount === 0) {
    return {
      coverType: 'none',
      acBonus: 0,
      dexSaveBonus: 0,
      blockedHexCount: 0,
      interveningCount: intervening.length,
      canTarget: true,
      description: 'No cover (+0 AC)',
    };
  }

  if (blockedHexCount === 1) {
    return {
      coverType: 'half',
      acBonus: 2,
      dexSaveBonus: 2,
      blockedHexCount,
      interveningCount: intervening.length,
      canTarget: true,
      description: 'Half cover (+2 AC, +2 DEX saves)',
    };
  }

  if (blockedHexCount >= intervening.length && intervening.length >= 3) {
    return {
      coverType: 'total',
      acBonus: 99,
      dexSaveBonus: 99,
      blockedHexCount,
      interveningCount: intervening.length,
      canTarget: false,
      description: 'Total cover (Target completely obstructed)',
    };
  }

  return {
    coverType: 'three-quarters',
    acBonus: 5,
    dexSaveBonus: 5,
    blockedHexCount,
    interveningCount: intervening.length,
    canTarget: true,
    description: 'Three-quarters cover (+5 AC, +5 DEX saves)',
  };
}

