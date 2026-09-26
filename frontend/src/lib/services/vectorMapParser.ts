// frontend/src/lib/services/vectorMapParser.ts
// Robust GIS/GeoJSON and Procedural Vector Map Geometry Parser
// Filters walls, contours, and structures with bounding box calculation and scale normalization.

export interface CanonicalWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  blocksLight: boolean;
  blocksMovement: boolean;
  door?: boolean;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface VectorParseOptions {
  targetWidth?: number;
  targetHeight?: number;
  cellSize?: number;
  padding?: number;
}

export interface ParsedVectorResult {
  walls: CanonicalWall[];
  bounds: BoundingBox;
  featureCount: number;
}

/**
 * Validates a 2D line segment to ensure no NaNs, non-zero length, and finite values.
 */
function isValidSegment(x1: number, y1: number, x2: number, y2: number, minLength = 1): boolean {
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return false;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy) >= minLength;
}

/**
 * Extracts line segments from GeoJSON coordinates based on geometry type.
 */
function extractSegmentsFromGeometry(
  geom: { type: string; coordinates: any },
  isDoor: boolean,
  blocksLight: boolean
): Array<{ p1: [number, number]; p2: [number, number]; door: boolean; blocksLight: boolean }> {
  const segments: Array<{ p1: [number, number]; p2: [number, number]; door: boolean; blocksLight: boolean }> = [];
  if (!geom || !geom.coordinates) return segments;

  const pushRing = (ring: number[][]) => {
    if (!Array.isArray(ring) || ring.length < 2) return;
    for (let i = 0; i < ring.length - 1; i++) {
      const c1 = ring[i];
      const c2 = ring[i + 1];
      if (Array.isArray(c1) && Array.isArray(c2) && c1.length >= 2 && c2.length >= 2) {
        segments.push({
          p1: [c1[0], c1[1]],
          p2: [c2[0], c2[1]],
          door: isDoor,
          blocksLight
        });
      }
    }
  };

  switch (geom.type) {
    case 'LineString': {
      pushRing(geom.coordinates as number[][]);
      break;
    }
    case 'MultiLineString': {
      if (Array.isArray(geom.coordinates)) {
        for (const line of geom.coordinates) {
          pushRing(line as number[][]);
        }
      }
      break;
    }
    case 'Polygon': {
      // Exterior boundary ring is coordinates[0]
      if (Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
        pushRing(geom.coordinates[0] as number[][]);
      }
      break;
    }
    case 'MultiPolygon': {
      if (Array.isArray(geom.coordinates)) {
        for (const poly of geom.coordinates) {
          if (Array.isArray(poly) && poly.length > 0) {
            pushRing(poly[0] as number[][]);
          }
        }
      }
      break;
    }
  }

  return segments;
}

/**
 * Robust GeoJSON parser for Watabou, Azgaar, Dungeon Scrawl, and generic GIS files.
 */
export function parseGeoJsonToWalls(
  rawInput: string | Record<string, any>,
  options: VectorParseOptions = {}
): ParsedVectorResult {
  let geojson: any;
  if (typeof rawInput === 'string') {
    try {
      geojson = JSON.parse(rawInput);
    } catch {
      return { walls: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }, featureCount: 0 };
    }
  } else {
    geojson = rawInput;
  }

  if (!geojson || typeof geojson !== 'object') {
    return { walls: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }, featureCount: 0 };
  }

  const features: any[] = Array.isArray(geojson.features)
    ? geojson.features
    : Array.isArray(geojson.data)
      ? geojson.data
      : geojson.type === 'Feature'
        ? [geojson]
        : [];

  const rawSegments: Array<{ p1: [number, number]; p2: [number, number]; door: boolean; blocksLight: boolean }> = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function trackBounds(x: number, y: number) {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  for (const feat of features) {
    if (!feat || !feat.geometry) continue;
    const props = feat.properties || {};
    const kind = String(props.type || props.kind || props.class || props.feature_type || '').toLowerCase();

    // Filter wall, building, structure, contour, room, barrier categories
    const isDoor = kind.includes('door') || kind.includes('portal') || kind.includes('gate');
    const isWall = kind.includes('wall') || kind.includes('building') || kind.includes('house') ||
                   kind.includes('room') || kind.includes('structure') || kind.includes('barrier') ||
                   kind.includes('contour') || (!kind && (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon'));

    const isRoad = kind.includes('road') || kind.includes('street') || kind.includes('path');

    // Only extract physical barriers/walls unless roads are explicitly present in a wall-less collection
    if (!isWall && !isDoor && !isRoad) continue;

    const extracted = extractSegmentsFromGeometry(feat.geometry, isDoor, isWall && !isRoad);
    for (const seg of extracted) {
      trackBounds(seg.p1[0], seg.p1[1]);
      trackBounds(seg.p2[0], seg.p2[1]);
      rawSegments.push(seg);
    }
  }

  if (minX === Infinity || rawSegments.length === 0) {
    return { walls: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }, featureCount: 0 };
  }

  const rawWidth = Math.max(1, maxX - minX);
  const rawHeight = Math.max(1, maxY - minY);
  const padding = options.padding ?? 60;

  // Determine scaling strategy
  let scaleX = 1;
  let scaleY = 1;

  if (options.targetWidth && options.targetHeight) {
    const usableW = Math.max(10, options.targetWidth - padding * 2);
    const usableH = Math.max(10, options.targetHeight - padding * 2);
    const uniformScale = Math.min(usableW / rawWidth, usableH / rawHeight);
    scaleX = uniformScale;
    scaleY = uniformScale;
  } else if (options.cellSize) {
    scaleX = options.cellSize;
    scaleY = options.cellSize;
  }

  const walls: CanonicalWall[] = [];
  let wallCounter = 1;

  for (const seg of rawSegments) {
    const x1 = (seg.p1[0] - minX) * scaleX + padding;
    const y1 = (seg.p1[1] - minY) * scaleY + padding;
    const x2 = (seg.p2[0] - minX) * scaleX + padding;
    const y2 = (seg.p2[1] - minY) * scaleY + padding;

    if (isValidSegment(x1, y1, x2, y2, 2)) {
      walls.push({
        id: `wall-geo-${Date.now()}-${wallCounter++}`,
        x1: Math.round(x1 * 10) / 10,
        y1: Math.round(y1 * 10) / 10,
        x2: Math.round(x2 * 10) / 10,
        y2: Math.round(y2 * 10) / 10,
        blocksLight: seg.blocksLight,
        blocksMovement: true,
        door: seg.door
      });
    }
  }

  const computedBounds: BoundingBox = {
    minX: padding,
    minY: padding,
    maxX: Math.round((rawWidth * scaleX + padding * 2) * 10) / 10,
    maxY: Math.round((rawHeight * scaleY + padding * 2) * 10) / 10,
    width: Math.round((rawWidth * scaleX + padding * 2) * 10) / 10,
    height: Math.round((rawHeight * scaleY + padding * 2) * 10) / 10
  };

  return {
    walls,
    bounds: computedBounds,
    featureCount: features.length
  };
}

/**
 * Generates exact pixel wall colliders for the Procedural Great Hall Chamber generator.
 */
export function generateChamberColliders(
  canvasWidth: number,
  canvasHeight: number,
  cell: number,
  pillars: Array<{ x: number; y: number; r: number }>
): CanonicalWall[] {
  const walls: CanonicalWall[] = [];
  let idx = 1;

  // Chamber outer bounds with 2-cell margin
  const minX = cell * 2;
  const minY = cell * 2;
  const maxX = canvasWidth - cell * 2;
  const maxY = canvasHeight - cell * 2;

  // 4 Outer bounding walls
  walls.push({ id: `ch-wall-${idx++}`, x1: minX, y1: minY, x2: maxX, y2: minY, blocksLight: true, blocksMovement: true });
  walls.push({ id: `ch-wall-${idx++}`, x1: maxX, y1: minY, x2: maxX, y2: maxY, blocksLight: true, blocksMovement: true });
  walls.push({ id: `ch-wall-${idx++}`, x1: maxX, y1: maxY, x2: minX, y2: maxY, blocksLight: true, blocksMovement: true });
  walls.push({ id: `ch-wall-${idx++}`, x1: minX, y1: maxY, x2: minX, y2: minY, blocksLight: true, blocksMovement: true });

  // Pillar octagonal or diamond colliders
  for (const p of pillars) {
    const r = p.r || 26;
    const sides = 8;
    const step = (Math.PI * 2) / sides;
    for (let i = 0; i < sides; i++) {
      const a1 = i * step;
      const a2 = (i + 1) * step;
      const x1 = Math.round(p.x + Math.cos(a1) * r);
      const y1 = Math.round(p.y + Math.sin(a1) * r);
      const x2 = Math.round(p.x + Math.cos(a2) * r);
      const y2 = Math.round(p.y + Math.sin(a2) * r);

      walls.push({
        id: `ch-col-${idx++}`,
        x1,
        y1,
        x2,
        y2,
        blocksLight: true,
        blocksMovement: true
      });
    }
  }

  return walls;
}

/**
 * Generates exact pixel wall colliders for the Subterranean Crypt Dungeon rooms & corridors.
 */
export function generateDungeonCryptColliders(
  rooms: Array<{ x: number; y: number; w: number; h: number }>,
  corridors: Array<{ x: number; y: number; w: number; h: number }>,
  cell: number
): CanonicalWall[] {
  const walls: CanonicalWall[] = [];
  let idx = 1;

  // Perimeter bounding boxes for each room in pixel coordinates
  for (const r of rooms) {
    const rx1 = r.x * cell;
    const ry1 = r.y * cell;
    const rx2 = (r.x + r.w) * cell;
    const ry2 = (r.y + r.h) * cell;

    walls.push({ id: `crypt-wall-${idx++}`, x1: rx1, y1: ry1, x2: rx2, y2: ry1, blocksLight: true, blocksMovement: true });
    walls.push({ id: `crypt-wall-${idx++}`, x1: rx2, y1: ry1, x2: rx2, y2: ry2, blocksLight: true, blocksMovement: true });
    walls.push({ id: `crypt-wall-${idx++}`, x1: rx2, y1: ry2, x2: rx1, y2: ry2, blocksLight: true, blocksMovement: true });
    walls.push({ id: `crypt-wall-${idx++}`, x1: rx1, y1: ry2, x2: rx1, y2: ry1, blocksLight: true, blocksMovement: true });
  }

  // Corridor walls
  for (const c of corridors) {
    const cx1 = c.x * cell;
    const cy1 = c.y * cell;
    const cx2 = (c.x + c.w) * cell;
    const cy2 = (c.y + c.h) * cell;

    // If corridor is vertical, add left & right walls
    if (c.h > c.w) {
      walls.push({ id: `crypt-cor-${idx++}`, x1: cx1, y1: cy1, x2: cx1, y2: cy2, blocksLight: true, blocksMovement: true });
      walls.push({ id: `crypt-cor-${idx++}`, x1: cx2, y1: cy1, x2: cx2, y2: cy2, blocksLight: true, blocksMovement: true });
    } else {
      // Horizontal corridor, add top & bottom walls
      walls.push({ id: `crypt-cor-${idx++}`, x1: cx1, y1: cy1, x2: cx2, y2: cy1, blocksLight: true, blocksMovement: true });
      walls.push({ id: `crypt-cor-${idx++}`, x1: cx1, y1: cy2, x2: cx2, y2: cy2, blocksLight: true, blocksMovement: true });
    }
  }

  return walls;
}
