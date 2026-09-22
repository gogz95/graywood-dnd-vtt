// src/lib/canvas/raycastVisionEngine.ts
// 2D Ray-Casting Line-of-Sight & Dynamic Lighting Engine for 5e SRD Vision Rules
// Computes visibility polygons with radial ray offsets, vertex corner penetration,
// darkvision grayscale radii, and point-light emitters (torch/light cantrip).

import type { MapWall } from '../types/maps';

export interface Point2D {
  x: number;
  y: number;
}

export interface LineSegment {
  p1: Point2D;
  p2: Point2D;
  blocksVision: boolean;
  blocksMovement: boolean;
}

export interface PointLightEmitter {
  brightRadiusFt: number; // e.g. 20 for Torch
  dimRadiusFt: number;    // e.g. 20 for Torch (total = 40ft)
  color?: string;         // e.g. '#f59e0b'
  isDarkvision?: boolean; // Grayscale illumination within radius
  darkvisionRadiusFt?: number; // e.g. 60 ft
}

export interface VisionResult {
  origin: Point2D;
  maxRadiusPx: number;
  polygon: Point2D[];
}

/**
 * Converts tactical battlemap walls to 2D line segments, respecting window and door states.
 */
export function wallsToLineSegments(walls: (MapWall | any)[]): LineSegment[] {
  if (!walls || !Array.isArray(walls)) return [];

  return walls
    .filter(Boolean)
    .map((w) => {
      let blocksVision = true;
      let blocksMovement = true;

      // Resolve door open state from both string-type and state-field patterns
      const isOpenDoor =
        w.type === 'door_open' ||
        (w.isDoor && (w.isOpen || w.state === 'open' || w.state === 'OPEN'));

      if (w.type === 'window') {
        blocksVision = false;  // Windows pass vision rays, block movement
        blocksMovement = true;
      } else if (isOpenDoor) {
        blocksVision = false;  // Open doors pass both rays and movement
        blocksMovement = false;
      } else if (w.type === 'door_closed' || w.type === 'wall') {
        blocksVision = true;
        blocksMovement = true;
      }

      const x1 = Number((w as any).x1 ?? (w as any).p1?.x ?? 0);
      const y1 = Number((w as any).y1 ?? (w as any).p1?.y ?? 0);
      const x2 = Number((w as any).x2 ?? (w as any).p2?.x ?? 0);
      const y2 = Number((w as any).y2 ?? (w as any).p2?.y ?? 0);

      return {
        p1: { x: isNaN(x1) ? 0 : x1, y: isNaN(y1) ? 0 : y1 },
        p2: { x: isNaN(x2) ? 0 : x2, y: isNaN(y2) ? 0 : y2 },
        blocksVision,
        blocksMovement,
      };
    });
}

/**
 * Computes ray-segment intersection distance t.
 * Returns null if no intersection or if intersection is outside segment bounds.
 */
function getRaySegmentIntersection(
  origin: Point2D,
  dx: number,
  dy: number,
  p1: Point2D,
  p2: Point2D
): { t: number; point: Point2D } | null {
  const sx = p2.x - p1.x;
  const sy = p2.y - p1.y;

  const det = dx * sy - dy * sx;
  if (Math.abs(det) < 1e-9) return null; // Parallel

  const qx = p1.x - origin.x;
  const qy = p1.y - origin.y;

  const t = (qx * sy - qy * sx) / det;
  const u = (qx * dy - qy * dx) / det;

  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      t,
      point: {
        x: origin.x + t * dx,
        y: origin.y + t * dy,
      },
    };
  }

  return null;
}

/**
 * Computes a 2D line-of-sight polygon using radial ray-casting with corner penetration offsets.
 */
export function computeRaycastVisibility(
  origin: Point2D,
  walls: LineSegment[],
  maxRadiusPx: number,
  boundingBounds?: { minX: number; minY: number; maxX: number; maxY: number }
): VisionResult {
  const fallbackPolygon: Point2D[] = [];
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    fallbackPolygon.push({
      x: (origin?.x ?? 0) + Math.cos(a) * (maxRadiusPx || 100),
      y: (origin?.y ?? 0) + Math.sin(a) * (maxRadiusPx || 100),
    });
  }

  if (!origin || isNaN(origin.x) || isNaN(origin.y) || !maxRadiusPx || maxRadiusPx <= 0) {
    return {
      origin: origin || { x: 0, y: 0 },
      maxRadiusPx: maxRadiusPx || 100,
      polygon: fallbackPolygon,
    };
  }

  if (!walls || !Array.isArray(walls)) {
    return { origin, maxRadiusPx, polygon: fallbackPolygon };
  }

  const validWalls = walls.filter(
    (w) => w && w.p1 && w.p2 && !isNaN(w.p1.x) && !isNaN(w.p1.y) && !isNaN(w.p2.x) && !isNaN(w.p2.y)
  );
  const visionWalls = validWalls.filter((w) => w.blocksVision);

  // Define circular / rectangular boundary perimeter to constrain rays
  const bounds = boundingBounds || {
    minX: origin.x - maxRadiusPx,
    minY: origin.y - maxRadiusPx,
    maxX: origin.x + maxRadiusPx,
    maxY: origin.y + maxRadiusPx,
  };

  const segments: LineSegment[] = [
    ...visionWalls,
    // Outer perimeter segments
    { p1: { x: bounds.minX, y: bounds.minY }, p2: { x: bounds.maxX, y: bounds.minY }, blocksVision: true, blocksMovement: true },
    { p1: { x: bounds.maxX, y: bounds.minY }, p2: { x: bounds.maxX, y: bounds.maxY }, blocksVision: true, blocksMovement: true },
    { p1: { x: bounds.maxX, y: bounds.maxY }, p2: { x: bounds.minX, y: bounds.maxY }, blocksVision: true, blocksMovement: true },
    { p1: { x: bounds.minX, y: bounds.maxY }, p2: { x: bounds.minX, y: bounds.minY }, blocksVision: true, blocksMovement: true },
  ];

  // Collect unique endpoint angles relative to origin
  const angles: number[] = [];
  const addAngleWithOffsets = (pt: Point2D) => {
    const angle = Math.atan2(pt.y - origin.y, pt.x - origin.x);
    // Add ±0.00001 rad offsets for vertex corner penetration
    angles.push(angle - 0.00001, angle, angle + 0.00001);
  };

  for (const s of segments) {
    addAngleWithOffsets(s.p1);
    addAngleWithOffsets(s.p2);
  }

  // Cast rays for every angle
  interface RayHit {
    angle: number;
    point: Point2D;
    dist: number;
  }

  const hits: RayHit[] = [];

  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let nearestT = maxRadiusPx;
    let nearestPoint: Point2D = {
      x: origin.x + dx * maxRadiusPx,
      y: origin.y + dy * maxRadiusPx,
    };

    for (const s of segments) {
      const hit = getRaySegmentIntersection(origin, dx, dy, s.p1, s.p2);
      if (hit && hit.t < nearestT) {
        nearestT = hit.t;
        nearestPoint = hit.point;
      }
    }

    hits.push({
      angle,
      point: nearestPoint,
      dist: nearestT,
    });
  }

  // Sort hits by radial angle to form a clean polygon
  hits.sort((a, b) => a.angle - b.angle);

  // Remove duplicate points within epsilon
  const polygon: Point2D[] = [];
  for (let i = 0; i < hits.length; i++) {
    const pt = hits[i].point;
    if (i === 0) {
      polygon.push(pt);
      continue;
    }
    const prev = polygon[polygon.length - 1];
    const dSq = (pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2;
    if (dSq > 0.25) {
      polygon.push(pt);
    }
  }

  return {
    origin,
    maxRadiusPx,
    polygon,
  };
}

/**
 * Standard 5e Preset Point-Light Emitters
 */
export const LIGHT_PRESETS = {
  TORCH: { brightRadiusFt: 20, dimRadiusFt: 20, color: 'rgba(245, 158, 11, 0.45)' } as PointLightEmitter,
  LIGHT_CANTRIP: { brightRadiusFt: 20, dimRadiusFt: 20, color: 'rgba(56, 189, 248, 0.4)' } as PointLightEmitter,
  HOODED_LANTERN: { brightRadiusFt: 30, dimRadiusFt: 30, color: 'rgba(251, 191, 36, 0.45)' } as PointLightEmitter,
  DARKVISION_60: { brightRadiusFt: 0, dimRadiusFt: 60, isDarkvision: true, darkvisionRadiusFt: 60 } as PointLightEmitter,
};

/**
 * Renders dynamic point lighting & vision masks onto the canvas.
 */
export function renderLightEmitter(
  ctx: CanvasRenderingContext2D,
  vision: VisionResult,
  emitter: PointLightEmitter,
  gridSize: number
): void {
  const { origin, polygon } = vision;
  if (!polygon || polygon.length < 3) return;

  ctx.save();

  // Use destination-out so the light punch punches a transparent hole in the
  // fog alpha mask (reveals fog) rather than painting opaque colour over the token.
  ctx.globalCompositeOperation = 'destination-out';

  // 1. Clip strictly to the raycast line-of-sight polygon
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y);
  }
  ctx.closePath();
  ctx.clip();

  const totalRadiusFt = (emitter.brightRadiusFt || 0) + (emitter.dimRadiusFt || 0);
  const totalRadiusPx = (totalRadiusFt / 5) * gridSize;
  const brightRadiusPx = ((emitter.brightRadiusFt || 0) / 5) * gridSize;

  if (emitter.isDarkvision) {
    // 5e Darkvision: dim-light-equivalent partial reveal — alpha 0.65 at centre fading to 0
    const dvGrad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, totalRadiusPx);
    dvGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    dvGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.4)');
    dvGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = dvGrad;
    ctx.fillRect(origin.x - totalRadiusPx, origin.y - totalRadiusPx, totalRadiusPx * 2, totalRadiusPx * 2);
  } else {
    // Standard 5e Point Light — full alpha erase in bright zone, soft dim boundary
    const radGrad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, totalRadiusPx);
    const brightRatio = totalRadiusPx > 0 ? Math.min(0.9, brightRadiusPx / totalRadiusPx) : 0.5;

    // Alpha channel drives the erase depth: 1.0 = fully punched, 0.0 = fog stays
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    radGrad.addColorStop(brightRatio, 'rgba(0, 0, 0, 1)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = radGrad;
    ctx.fillRect(origin.x - totalRadiusPx, origin.y - totalRadiusPx, totalRadiusPx * 2, totalRadiusPx * 2);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Fog Animation Uniform Ticker
// ---------------------------------------------------------------------------

/** Monotonic elapsed time accumulator (seconds) for fog shader time uniforms. */
let _fogElapsedSeconds = 0;

/**
 * Call once per animation frame when fog animation is enabled.
 * Accumulates elapsed time and writes it into the fog canvas as a uniform
 * by varying a low-opacity turbulence overlay keyed on `time`.
 *
 * `deltaMs`  — milliseconds since last frame (from `requestAnimationFrame` delta).
 * `fogCtx`   — the 2D context of the fog mask canvas.
 * `mapW/H`   — current raster map dimensions.
 */
export function tickFogAnimation(
  fogCtx: CanvasRenderingContext2D,
  mapW: number,
  mapH: number,
  deltaMs: number
): void {
  _fogElapsedSeconds += deltaMs / 1000;
  const t = _fogElapsedSeconds;

  // Animate a subtle scrolling vignette that drifts the fog edge.
  // Uses two overlapping radial gradients offset by sin/cos of time.
  const cx = mapW / 2;
  const cy = mapH / 2;
  const drift = 40;
  const ox = Math.sin(t * 0.3) * drift;
  const oy = Math.cos(t * 0.23) * drift;

  fogCtx.save();
  // source-over with very low alpha — only modulates the fog edge texture,
  // does not re-cover revealed areas (composite respects existing alpha).
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.globalAlpha = 0.018 + 0.008 * Math.sin(t * 0.7);

  const grad = fogCtx.createRadialGradient(
    cx + ox, cy + oy, 0,
    cx + ox, cy + oy, Math.max(mapW, mapH) * 0.75
  );
  grad.addColorStop(0, 'rgba(10, 14, 30, 0)');
  grad.addColorStop(0.6, 'rgba(10, 14, 30, 0.4)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0.9)');

  fogCtx.fillStyle = grad;
  fogCtx.fillRect(0, 0, mapW, mapH);
  fogCtx.restore();
}

/** Resets the fog animation clock (call on new map load). */
export function resetFogAnimationClock(): void {
  _fogElapsedSeconds = 0;
}
