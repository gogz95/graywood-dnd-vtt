// src/lib/services/fogOfWarService.ts
// 2D Raycast Wall Shadow Occlusion & Dynamic Fog of War masking

import { wallStore, type WallSegment } from '../stores/wallStore.svelte';

export interface VisionSource {
  x: number;
  y: number;
  brightRadiusPx: number;
  dimRadiusPx: number;
}

export type VisionPreset = 'blind' | 'torch' | 'darkvision' | 'light_cantrip';

export function getPresetRadii(preset: VisionPreset, pixelsPerSquare = 70): { bright: number; dim: number } {
  const sq = pixelsPerSquare / 5; // Pixels per foot
  switch (preset) {
    case 'torch':
      return { bright: 20 * sq, dim: 40 * sq };
    case 'darkvision':
      return { bright: 0, dim: 60 * sq };
    case 'light_cantrip':
      return { bright: 20 * sq, dim: 40 * sq };
    case 'blind':
    default:
      return { bright: 0, dim: 0 };
  }
}

interface RayIntersection {
  x: number;
  y: number;
  t: number;
  angle: number;
}

/**
 * Computes intersection between a ray starting at (ox, oy) in direction (dx, dy)
 * and a line segment between (x1, y1) and (x2, y2).
 */
function raySegmentIntersection(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; t: number } | null {
  const rpx = dx;
  const rpy = dy;
  const spx = x2 - x1;
  const spy = y2 - y1;

  const rxs = rpx * spy - rpy * spx;
  if (Math.abs(rxs) < 1e-9) return null; // Parallel

  const qpx = x1 - ox;
  const qpy = y1 - oy;

  const t = (qpx * spy - qpy * spx) / rxs;
  const u = (qpx * rpy - qpy * rpx) / rxs;

  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      x: ox + t * dx,
      y: oy + t * dy,
      t,
    };
  }

  return null;
}

/**
 * Deterministic 2D Raycast Visibility Polygon Construction.
 * Casts rays to all relevant wall endpoints (plus +/- 0.00001 radian offsets)
 * within the vision source's radius, finding nearest segment intersections.
 */
export function computeVisibilityPolygon(
  originX: number,
  originY: number,
  maxRadius: number,
  walls: WallSegment[]
): Array<[number, number]> {
  if (maxRadius <= 0) return [];

  const activeWalls = walls.filter((w) => w.blocksVision && !(w.isDoor && w.isOpen));
  const rawAngles = new Set<number>();

  // Add 16 circular perimeter sample angles for smooth round falloff
  const perimeterCount = 16;
  for (let i = 0; i < perimeterCount; i++) {
    rawAngles.add((i / perimeterCount) * Math.PI * 2 - Math.PI);
  }

  // Collect angles to all wall endpoints within or near the vision radius
  const maxRadiusSq = (maxRadius * 1.5) * (maxRadius * 1.5);
  for (const w of activeWalls) {
    const d1 = (w.x1 - originX) ** 2 + (w.y1 - originY) ** 2;
    const d2 = (w.x2 - originX) ** 2 + (w.y2 - originY) ** 2;

    if (d1 <= maxRadiusSq || d2 <= maxRadiusSq) {
      const a1 = Math.atan2(w.y1 - originY, w.x1 - originX);
      const a2 = Math.atan2(w.y2 - originY, w.x2 - originX);

      // Endpoint ray and +/- 0.00001 radian offset rays
      rawAngles.add(a1);
      rawAngles.add(a1 - 0.00001);
      rawAngles.add(a1 + 0.00001);

      rawAngles.add(a2);
      rawAngles.add(a2 - 0.00001);
      rawAngles.add(a2 + 0.00001);
    }
  }

  const intersections: RayIntersection[] = [];

  for (const angle of rawAngles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let closestT = maxRadius;
    let hitX = originX + dx * maxRadius;
    let hitY = originY + dy * maxRadius;

    for (const w of activeWalls) {
      const hit = raySegmentIntersection(originX, originY, dx, dy, w.x1, w.y1, w.x2, w.y2);
      if (hit && hit.t < closestT) {
        closestT = hit.t;
        hitX = hit.x;
        hitY = hit.y;
      }
    }

    intersections.push({
      x: hitX,
      y: hitY,
      t: closestT,
      angle,
    });
  }

  // Sort intersections monotonically by angle around origin (-PI to PI)
  intersections.sort((a, b) => a.angle - b.angle);

  return intersections.map((pt) => [pt.x, pt.y]);
}

/**
 * Renders the Fog of War shroud with 2D raycast wall shadow occlusion.
 */
export function renderFogMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sources: VisionSource[],
  isGmView = false,
  explicitWalls?: WallSegment[]
) {
  const walls = explicitWalls || wallStore.walls;

  // Clear buffer
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Fill exploration shroud
  ctx.fillStyle = isGmView ? 'rgba(15, 23, 42, 0.65)' : 'rgba(2, 6, 23, 0.98)';
  ctx.fillRect(0, 0, width, height);

  // Cut out active vision sources using destination-out blending
  ctx.globalCompositeOperation = 'destination-out';

  for (const src of sources) {
    if (src.dimRadiusPx <= 0) continue;

    const polygon = computeVisibilityPolygon(src.x, src.y, src.dimRadiusPx, walls);
    if (polygon.length < 3) continue;

    ctx.save();

    // 1. Clip path to raycast visibility polygon
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i][0], polygon[i][1]);
    }
    ctx.closePath();
    ctx.clip();

    // 2. Intersect radial light falloff gradient with visibility polygon
    const grad = ctx.createRadialGradient(
      src.x,
      src.y,
      Math.max(0, src.brightRadiusPx),
      src.x,
      src.y,
      src.dimRadiusPx
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}
