// LightShadowRenderer.ts — 2D raycast lighting, shadow geometry, and vector map renderer
// Computes vision polygons and shadow projections from wall colliders and doors using raycasting.

import { computeViewport } from 'visibility-polygon';
import { Container, Graphics } from 'pixi.js';
import type { WallSegment, DoorPrimitive } from './parsers/dungeonScrawlParser';
import type { WatabouCityMap, BuildingParcel } from './parsers/watabouParser';

export interface VisionSource {
  id: string;
  x: number; // canvas pixel coordinates
  y: number;
  radius: number; // vision/light radius in pixels (e.g. 300px)
  color?: string; // e.g. '#fbbf24' (torch) or '#60a5fa' (magic)
  intensity?: number; // 0.0 - 1.0
}

export interface ShadowRay {
  origin: { x: number; y: number };
  angle: number;
  hit: { x: number; y: number };
  dist: number;
}

/**
 * Converts WallSegments and closed doors to visibility-polygon Segment tuples.
 */
export function buildVisibilitySegments(
  walls: WallSegment[],
  doors: DoorPrimitive[],
  bounds?: { minX: number; minY: number; maxX: number; maxY: number }
): [ [number, number], [number, number] ][] {
  const segments: [ [number, number], [number, number] ][] = [];

  // Add walls
  for (const w of walls) {
    segments.push([ [w.x1, w.y1], [w.x2, w.y2] ]);
  }

  // Add closed doors (open doors do not block raycasts)
  for (const d of doors) {
    if (d.state === 'CLOSED') {
      segments.push([ [d.x1, d.y1], [d.x2, d.y2] ]);
    }
  }

  // Add outer boundary walls if specified
  if (bounds) {
    const { minX, minY, maxX, maxY } = bounds;
    segments.push([ [minX, minY], [maxX, minY] ]);
    segments.push([ [maxX, minY], [maxX, maxY] ]);
    segments.push([ [maxX, maxY], [minX, maxY] ]);
    segments.push([ [minX, maxY], [minX, minY] ]);
  }

  return segments;
}

/**
 * Computes the 2D visibility polygon from a light/vision origin.
 * Uses VisibilityPolygon library with fallback angular sweep.
 */
export function computeVisionPolygon(
  origin: { x: number; y: number },
  radius: number,
  walls: WallSegment[],
  doors: DoorPrimitive[]
): Array<{ x: number; y: number }> {
  const bounds = {
    minX: origin.x - radius,
    minY: origin.y - radius,
    maxX: origin.x + radius,
    maxY: origin.y + radius,
  };

  const segments = buildVisibilitySegments(walls, doors, bounds);

  try {
    const polyPoints = computeViewport(
      [origin.x, origin.y],
      segments,
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.maxY]
    );

    if (Array.isArray(polyPoints) && polyPoints.length >= 3) {
      return polyPoints.map(([x, y]) => ({ x, y }));
    }
  } catch {
    // Fallback circular approximation if segment degenerate
  }

  // Circular fallback
  const circlePoints: Array<{ x: number; y: number }> = [];
  const steps = 36;
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    circlePoints.push({
      x: origin.x + Math.cos(theta) * radius,
      y: origin.y + Math.sin(theta) * radius,
    });
  }
  return circlePoints;
}

/**
 * Determines whether a 2D point is inside a polygon using ray casting algorithm.
 */
export function isPointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>
): boolean {
  if (!polygon || polygon.length < 3) return false;
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ═════════════════════════════════════════════════════════════════════════════
// CANVAS 2D RENDERING PIPELINE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Renders atmospheric shadow-casting vision fog for a list of tokens/lights.
 */
export function renderDynamicLighting(
  ctx: CanvasRenderingContext2D,
  viewBounds: { x: number; y: number; width: number; height: number },
  visionSources: VisionSource[],
  walls: WallSegment[],
  doors: DoorPrimitive[],
  ambientDarkness = 0.65
): void {
  if (visionSources.length === 0 && walls.length === 0) return;

  ctx.save();

  // Create an offscreen buffer or apply global composition
  // 1. Draw ambient darkness over the entire viewport
  ctx.fillStyle = `rgba(5, 7, 15, ${ambientDarkness})`;
  ctx.fillRect(viewBounds.x, viewBounds.y, viewBounds.width, viewBounds.height);

  // 2. Punch out / blend vision cones for each token
  for (const source of visionSources) {
    const polygon = computeVisionPolygon({ x: source.x, y: source.y }, source.radius, walls, doors);
    if (polygon.length < 3) continue;

    ctx.save();
    // Clip to visibility polygon
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x, polygon[i].y);
    }
    ctx.closePath();
    ctx.clip();

    // Composite soft radial torchlight
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(
      source.x, source.y, 0,
      source.x, source.y, source.radius
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.85)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius, 0, Math.PI * 2);
    ctx.fill();

    // Add subtle ambient tint on top
    ctx.globalCompositeOperation = 'source-over';
    const tintGrad = ctx.createRadialGradient(
      source.x, source.y, 0,
      source.x, source.y, source.radius
    );
    const tintColor = source.color || 'rgba(251, 191, 36, 0.12)';
    tintGrad.addColorStop(0, tintColor);
    tintGrad.addColorStop(0.8, 'rgba(251, 191, 36, 0.03)');
    tintGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = tintGrad;
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

export interface VisionPolygonResult {
  source: VisionSource;
  polygon: Array<{ x: number; y: number }>;
}

/**
 * Renders two-stage player Fog of War:
 * - Unexplored territory: pitch-black opaque shroud (rgba(5, 7, 15, 0.98))
 * - Explored territory: dim memory fog (rgba(5, 7, 15, 0.72))
 * - Active player line-of-sight: brightly illuminated with atmospheric lighting
 */
export function renderExploredFogOfWar(
  ctx: CanvasRenderingContext2D,
  viewBounds: { x: number; y: number; width: number; height: number },
  visionSources: VisionSource[],
  walls: WallSegment[],
  doors: DoorPrimitive[],
  exploredCells: Set<string> | string[],
  gridSize: number,
  unexploredDarkness = 0.98,
  dimFogDarkness = 0.72
): VisionPolygonResult[] {
  const exploredSet = Array.isArray(exploredCells) ? new Set(exploredCells) : exploredCells;

  // 1. Compute polygons for all active vision sources
  const visionResults: VisionPolygonResult[] = [];
  for (const source of visionSources) {
    const poly = computeVisionPolygon({ x: source.x, y: source.y }, source.radius, walls, doors);
    if (poly.length >= 3) {
      visionResults.push({ source, polygon: poly });
    }
  }

  ctx.save();

  // 2. Identify visible grid bounds
  const startCol = Math.floor(viewBounds.x / gridSize) - 1;
  const startRow = Math.floor(viewBounds.y / gridSize) - 1;
  const endCol = Math.ceil((viewBounds.x + viewBounds.width) / gridSize) + 1;
  const endRow = Math.ceil((viewBounds.y + viewBounds.height) / gridSize) + 1;

  // 3. Draw unexplored shroud vs explored memory cells
  for (let c = startCol; c <= endCol; c++) {
    for (let r = startRow; r <= endRow; r++) {
      const key = `${c},${r}`;
      const isExplored = exploredSet.has(key);
      const cellX = c * gridSize;
      const cellY = r * gridSize;

      if (!isExplored) {
        // Unexplored: completely shrouded in dark void
        ctx.fillStyle = `rgba(5, 7, 15, ${unexploredDarkness})`;
        ctx.fillRect(cellX, cellY, gridSize, gridSize);
      } else {
        // Explored memory: dim fog
        ctx.fillStyle = `rgba(5, 7, 15, ${dimFogDarkness})`;
        ctx.fillRect(cellX, cellY, gridSize, gridSize);
      }
    }
  }

  // 4. Punch out active line of sight for each player vision cone
  for (const { source, polygon } of visionResults) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x, polygon[i].y);
    }
    ctx.closePath();
    ctx.clip();

    // Clear fog over active vision polygon
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(
      source.x, source.y, 0,
      source.x, source.y, source.radius
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.9)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius, 0, Math.PI * 2);
    ctx.fill();

    // Ambient warm torchlight tint
    ctx.globalCompositeOperation = 'source-over';
    const tintGrad = ctx.createRadialGradient(
      source.x, source.y, 0,
      source.x, source.y, source.radius
    );
    const tintColor = source.color || 'rgba(251, 191, 36, 0.16)';
    tintGrad.addColorStop(0, tintColor);
    tintGrad.addColorStop(0.8, 'rgba(251, 191, 36, 0.04)');
    tintGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = tintGrad;
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
  return visionResults;
}


/**
 * Renders Dungeon Scrawl wall line segments onto canvas.
 */
export function renderWallSegments(
  ctx: CanvasRenderingContext2D,
  walls: WallSegment[],
  vpZoom = 1.0
): void {
  if (walls.length === 0) return;

  ctx.save();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = Math.max(2, 3.5 / vpZoom);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (const w of walls) {
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
  }
  ctx.stroke();

  // Subtle endpoint caps
  ctx.fillStyle = '#a5b4fc';
  for (const w of walls) {
    ctx.beginPath();
    ctx.arc(w.x1, w.y1, 2.5 / vpZoom, 0, Math.PI * 2);
    ctx.arc(w.x2, w.y2, 2.5 / vpZoom, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Renders interactable doors with state indicators (Open = green/teal, Closed = amber/orange).
 */
export function renderDoors(
  ctx: CanvasRenderingContext2D,
  doors: DoorPrimitive[],
  vpZoom = 1.0
): void {
  if (doors.length === 0) return;

  ctx.save();
  for (const d of doors) {
    const isOpen = d.state === 'OPEN';
    const midX = (d.x1 + d.x2) / 2;
    const midY = (d.y1 + d.y2) / 2;

    // Door line
    ctx.beginPath();
    ctx.strokeStyle = isOpen ? '#10b981' : '#f59e0b';
    ctx.lineWidth = Math.max(3, 5 / vpZoom);
    ctx.lineCap = 'square';

    if (isOpen) {
      // Swing open: render perpendicular tick
      const angle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1) + Math.PI / 2;
      const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / 2;
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x1 + Math.cos(angle) * len, d.y1 + Math.sin(angle) * len);
    } else {
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
    }
    ctx.stroke();

    // Center badge with status icon
    ctx.beginPath();
    ctx.fillStyle = isOpen ? '#064e3b' : '#78350f';
    ctx.arc(midX, midY, 7 / vpZoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isOpen ? '#34d399' : '#fbbf24';
    ctx.lineWidth = 1.5 / vpZoom;
    ctx.stroke();

    // Door label text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(8, 10 / vpZoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isOpen ? 'O' : 'D', midX, midY);
  }
  ctx.restore();
}

/**
 * Renders Watabou city districts, building lots, and road networks.
 */
export function renderWatabouDistricts(
  ctx: CanvasRenderingContext2D,
  cityMap: WatabouCityMap,
  selectedParcelId: string | null = null,
  vpZoom = 1.0
): void {
  ctx.save();

  // 1. Districts (soft tinted background polygons)
  for (const d of cityMap.districts) {
    if (d.points.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(d.points[0].x, d.points[0].y);
    for (let i = 1; i < d.points.length; i++) {
      ctx.lineTo(d.points[i].x, d.points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = `${d.color}15`; // 8% opacity tint
    ctx.fill();
    ctx.strokeStyle = `${d.color}50`;
    ctx.lineWidth = 1.5 / vpZoom;
    ctx.stroke();
  }

  // 2. Roads
  ctx.strokeStyle = '#334155';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of cityMap.roads) {
    if (r.points.length < 2) continue;
    ctx.lineWidth = Math.max(2, (r.width || 4) / vpZoom);
    ctx.beginPath();
    ctx.moveTo(r.points[0].x, r.points[0].y);
    for (let i = 1; i < r.points.length; i++) {
      ctx.lineTo(r.points[i].x, r.points[i].y);
    }
    ctx.stroke();
  }

  // 3. Defensive walls
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = Math.max(3, 6 / vpZoom);
  for (const w of cityMap.walls) {
    if (w.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(w.points[0].x, w.points[0].y);
    for (let i = 1; i < w.points.length; i++) {
      ctx.lineTo(w.points[i].x, w.points[i].y);
    }
    ctx.stroke();
  }

  // 4. Buildings (Clickable parcels)
  for (const b of cityMap.buildings) {
    if (b.points.length < 3) continue;

    const isSelected = b.id === selectedParcelId;
    const hasEntity = !!b.entityType;

    ctx.beginPath();
    ctx.moveTo(b.points[0].x, b.points[0].y);
    for (let i = 1; i < b.points.length; i++) {
      ctx.lineTo(b.points[i].x, b.points[i].y);
    }
    ctx.closePath();

    // Fill color depends on entity assignment
    if (isSelected) {
      ctx.fillStyle = '#6366f1';
    } else if (hasEntity) {
      ctx.fillStyle = b.entityType === 'Tavern' ? '#b45309' :
                      b.entityType === 'Temple' ? '#831843' :
                      b.entityType === 'Smithy' ? '#1e3a5f' :
                      b.entityType === 'Vault'  ? '#064e3b' : '#334155';
    } else {
      ctx.fillStyle = '#1e293b';
    }
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#a5b4fc' : hasEntity ? '#fbbf24' : '#475569';
    ctx.lineWidth = isSelected ? 2 / vpZoom : 0.75 / vpZoom;
    ctx.stroke();

    // Label on assigned entity buildings
    if (hasEntity && vpZoom >= 0.7) {
      const midX = (b.bounds.minX + b.bounds.maxX) / 2;
      const midY = (b.bounds.minY + b.bounds.maxY) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(7, 9 / vpZoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.customName || b.entityType || '', midX, midY);
    }
  }

  ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
// PIXIJS v8 NATIVE ENGINE INTEGRATIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Creates a native PixiJS v8 Graphics object rendering wall colliders and doors.
 */
export function createPixiWallGraphics(walls: WallSegment[], doors: DoorPrimitive[]): Graphics {
  const g = new Graphics();

  // Solid Walls
  for (const w of walls) {
    g.moveTo(w.x1, w.y1)
     .lineTo(w.x2, w.y2)
     .stroke({ color: 0x38bdf8, width: 4, cap: 'round' });
  }

  // Doors
  for (const d of doors) {
    const isClosed = d.state === 'CLOSED';
    const doorColor = isClosed ? 0xd97706 : 0x10b981;
    g.moveTo(d.x1, d.y1)
     .lineTo(d.x2, d.y2)
     .stroke({ color: doorColor, width: 6, cap: 'round' });

    const midX = (d.x1 + d.x2) / 2;
    const midY = (d.y1 + d.y2) / 2;
    g.circle(midX, midY, 6)
     .fill({ color: doorColor })
     .stroke({ color: 0x000000, width: 1.5 });
  }

  return g;
}

/**
 * Creates a native PixiJS v8 shadow mask Graphics object using raycasting visibility polygons.
 * Uses blendMode = 'erase' to carve out illuminated vision cones.
 */
export function createPixiShadowMask(
  visionSources: VisionSource[],
  walls: WallSegment[],
  doors: DoorPrimitive[]
): Graphics {
  const mask = new Graphics();
  mask.blendMode = 'erase';

  for (const vs of visionSources) {
    const poly = computeVisionPolygon({ x: vs.x, y: vs.y }, vs.radius, walls, doors);
    if (poly.length >= 3) {
      const flatPoints = poly.flatMap(p => [p.x, p.y]);
      mask.poly(flatPoints).fill({ color: 0xffffff, alpha: vs.intensity ?? 1.0 });
    }
  }

  return mask;
}

/**
 * Creates a native PixiJS v8 Container populated with Watabou districts, roads, walls, and building lots.
 */
export function createPixiWatabouContainer(cityMap: WatabouCityMap, selectedParcelId?: string): Container {
  const root = new Container();

  // 1. Districts
  const districtG = new Graphics();
  for (const d of cityMap.districts) {
    if (d.points.length < 3) continue;
    const hexColor = parseInt(d.color.replace('#', ''), 16) || 0x4f46e5;
    districtG.poly(d.points.flatMap(p => [p.x, p.y]))
             .fill({ color: hexColor, alpha: 0.18 })
             .stroke({ color: hexColor, width: 1.5, alpha: 0.4 });
  }
  root.addChild(districtG);

  // 2. Roads
  const roadG = new Graphics();
  for (const r of cityMap.roads) {
    if (r.points.length < 2) continue;
    roadG.moveTo(r.points[0].x, r.points[0].y);
    for (let i = 1; i < r.points.length; i++) {
      roadG.lineTo(r.points[i].x, r.points[i].y);
    }
    roadG.stroke({ color: 0x334155, width: r.width || 4, cap: 'round', join: 'round' });
  }
  root.addChild(roadG);

  // 3. Defensive Walls
  const wallG = new Graphics();
  for (const w of cityMap.walls) {
    if (w.points.length < 2) continue;
    wallG.moveTo(w.points[0].x, w.points[0].y);
    for (let i = 1; i < w.points.length; i++) {
      wallG.lineTo(w.points[i].x, w.points[i].y);
    }
    wallG.stroke({ color: 0x94a3b8, width: 6, cap: 'round', join: 'round' });
  }
  root.addChild(wallG);

  // 4. Buildings (Clickable lots)
  const bldgG = new Graphics();
  for (const b of cityMap.buildings) {
    if (b.points.length < 3) continue;
    const isSelected = b.id === selectedParcelId;
    const hasEntity = !!b.entityType;

    let fillHex = 0x1e293b;
    if (isSelected) {
      fillHex = 0x6366f1;
    } else if (hasEntity) {
      fillHex = b.entityType === 'Tavern' ? 0xb45309 :
                b.entityType === 'Temple' ? 0x831843 :
                b.entityType === 'Smithy' ? 0x1e3a5f :
                b.entityType === 'Vault'  ? 0x064e3b : 0x334155;
    }

    const strokeHex = isSelected ? 0xa5b4fc : hasEntity ? 0xfbbf24 : 0x475569;
    bldgG.poly(b.points.flatMap(p => [p.x, p.y]))
         .fill({ color: fillHex, alpha: isSelected ? 0.9 : 0.75 })
         .stroke({ color: strokeHex, width: isSelected ? 2 : 1 });
  }
  root.addChild(bldgG);

  return root;
}
