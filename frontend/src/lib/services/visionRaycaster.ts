// src/lib/services/visionRaycaster.ts
// 2D Radial Sweep Raycasting, Visibility Polygon & Light Emission Union Engine

import type { VttToken } from '../types/token';
import type { WallSegment, DoorPrimitive } from '../canvas/parsers/dungeonScrawlParser';

export interface Point2D {
  x: number;
  y: number;
}

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TokenVisionResult {
  tokenId: string;
  tokenName: string;
  isPlayer: boolean;
  visionPolygon: Point2D[];
  brightLightPolygon: Point2D[];
  dimLightPolygon: Point2D[];
  lightColor: string;
  hasLight: boolean;
}

export interface CollectiveVisionComposite {
  // All active vision polygons (tokens' individual sight lines)
  visionPolygons: Point2D[][];
  // Bright light coverage polygons
  brightPolygons: Point2D[][];
  // Dim light coverage polygons
  dimPolygons: Point2D[][];
  // Token individual breakdowns
  tokenResults: TokenVisionResult[];
}

/**
 * Extracts line-of-sight wall segments from map walls and door portals.
 * Open doors allow rays to pass unimpeded; closed doors block rays.
 */
export function extractVisionObstacles(
  walls: Array<{ x1?: number; y1?: number; x2?: number; y2?: number; p1?: Point2D; p2?: Point2D }>,
  doors: Array<{
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    state?: string;
    doorType?: string;
    portalType?: 'door' | 'secret' | 'window';
    portalState?: 'open' | 'closed' | 'locked';
  }>
): LineSegment[] {
  const segments: LineSegment[] = [];

  if (Array.isArray(walls)) {
    for (const w of walls) {
      if (!w) continue;
      const x1 = Number(w.x1 ?? w.p1?.x ?? 0);
      const y1 = Number(w.y1 ?? w.p1?.y ?? 0);
      const x2 = Number(w.x2 ?? w.p2?.x ?? 0);
      const y2 = Number(w.y2 ?? w.p2?.y ?? 0);
      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
        segments.push({ x1, y1, x2, y2 });
      }
    }
  }

  if (Array.isArray(doors)) {
    for (const d of doors) {
      if (!d) continue;

      // Determine portal type: 'window' | 'secret' | 'door'
      const typeStr = (d.portalType || d.doorType || '').toLowerCase();
      const isWindow = typeStr.includes('window');
      const isSecret = typeStr.includes('secret');

      // 1. Windows allow vision rays to pass through at all times
      if (isWindow) {
        continue;
      }

      // Determine portal state: 'open' | 'closed' | 'locked'
      const stateStr = (d.portalState || d.state || 'closed').toLowerCase();
      const isOpen = stateStr === 'open';

      // 2. Secret doors: Always block vision rays unless explicitly toggled to open
      if (isSecret) {
        if (!isOpen) {
          const x1 = Number(d.x1 ?? 0);
          const y1 = Number(d.y1 ?? 0);
          const x2 = Number(d.x2 ?? 0);
          const y2 = Number(d.y2 ?? 0);
          if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            segments.push({ x1, y1, x2, y2 });
          }
        }
        continue;
      }

      // 3. Standard Doors: When open, allows vision rays. When closed or locked, blocks vision rays.
      if (!isOpen) {
        const x1 = Number(d.x1 ?? 0);
        const y1 = Number(d.y1 ?? 0);
        const x2 = Number(d.x2 ?? 0);
        const y2 = Number(d.y2 ?? 0);
        if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
          segments.push({ x1, y1, x2, y2 });
        }
      }
    }
  }

  return segments;
}

/**
 * Ray-segment intersection calculation.
 * Returns intersection point and parametric distance t if ray from (ox, oy) with direction (dx, dy) intersects.
 */
export function raySegmentIntersect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; t: number } | null {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const det = dx * sy - dy * sx;
  if (Math.abs(det) < 1e-9) return null;

  const qx = x1 - ox;
  const qy = y1 - oy;
  const t = (qx * sy - qy * sx) / det;
  const u = (qx * dy - qy * dx) / det;

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
 * Computes 2D visibility polygon via radial sweep line against obstacles with endpoint epsilon perturbation.
 */
export function computeRaycastPolygon(
  originX: number,
  originY: number,
  maxRadiusPx: number,
  obstacles: LineSegment[],
  samples: number = 32
): Point2D[] {
  if (maxRadiusPx <= 0) return [];

  const rawAngles = new Set<number>();
  const epsilon = 0.0001; // Epsilon perturbation for vertex corner penetration

  // Radial baseline circle samples
  for (let i = 0; i < samples; i++) {
    rawAngles.add((i / samples) * Math.PI * 2 - Math.PI);
  }

  // Filter obstacles roughly within reach to minimize intersection tests
  const rSq = maxRadiusPx * maxRadiusPx;
  const nearbyObstacles: LineSegment[] = [];

  for (const seg of obstacles) {
    const d1 = (seg.x1 - originX) ** 2 + (seg.y1 - originY) ** 2;
    const d2 = (seg.x2 - originX) ** 2 + (seg.y2 - originY) ** 2;

    if (d1 <= rSq * 2.25 || d2 <= rSq * 2.25) {
      nearbyObstacles.push(seg);

      const a1 = Math.atan2(seg.y1 - originY, seg.x1 - originX);
      const a2 = Math.atan2(seg.y2 - originY, seg.x2 - originX);

      rawAngles.add(a1);
      rawAngles.add(a1 - epsilon);
      rawAngles.add(a1 + epsilon);

      rawAngles.add(a2);
      rawAngles.add(a2 - epsilon);
      rawAngles.add(a2 + epsilon);
    }
  }

  interface Hit {
    x: number;
    y: number;
    angle: number;
  }

  const hits: Hit[] = [];

  for (const angle of rawAngles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let closestT = maxRadiusPx;
    let hitX = originX + dx * maxRadiusPx;
    let hitY = originY + dy * maxRadiusPx;

    for (const seg of nearbyObstacles) {
      const hit = raySegmentIntersect(originX, originY, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2);
      if (hit && hit.t < closestT) {
        closestT = hit.t;
        hitX = hit.x;
        hitY = hit.y;
      }
    }

    hits.push({ x: hitX, y: hitY, angle });
  }

  // Sort counter-clockwise to form a closed continuous polygon
  hits.sort((a, b) => a.angle - b.angle);

  return hits.map((h) => ({ x: h.x, y: h.y }));
}

/**
 * Calculates effective sensory distance in pixels for a 5e token.
 * Rules:
 * - 'blind': 0 ft vision range.
 * - 'normal': sees default 60 ft (requires light source in dark dungeons) or explicit range.
 * - 'darkvision': 60 ft (or configured range) in total darkness.
 * - 'blindsight' / 'truesight': penetrates darkness up to configured range.
 */
export function getTokenSensoryDistancePx(token: VttToken, pixelsPer5FtCell: number): number {
  const visionType = token.visionType ?? 'normal';
  if (visionType === 'blind') {
    return 0;
  }

  const rangeFeet = token.visionRange ?? 60;
  return Math.max(0, (rangeFeet / 5) * pixelsPer5FtCell);
}

/**
 * Computes collective vision and light emission polygons for all active tokens against wall & door geometry.
 */
export function computeCollectiveVision(
  tokens: VttToken[],
  obstacles: LineSegment[],
  gridSize: number
): CollectiveVisionComposite {
  const composite: CollectiveVisionComposite = {
    visionPolygons: [],
    brightPolygons: [],
    dimPolygons: [],
    tokenResults: [],
  };

  const pixelsPer5Ft = gridSize > 0 ? gridSize : 60;

  // Active party tokens (or all revealed tokens if no players designated)
  const partyTokens = tokens.filter((t) => t.isPlayer && t.isRevealed !== false);
  const activeTokens = partyTokens.length > 0 ? partyTokens : tokens.filter((t) => t.isRevealed !== false);

  for (const token of activeTokens) {
    const visionPx = getTokenSensoryDistancePx(token, pixelsPer5Ft);

    let visionPoly: Point2D[] = [];
    if (visionPx > 0) {
      visionPoly = computeRaycastPolygon(token.x, token.y, visionPx, obstacles);
      if (visionPoly.length >= 3) {
        composite.visionPolygons.push(visionPoly);
      }
    }

    // Check light emission
    let brightPoly: Point2D[] = [];
    let dimPoly: Point2D[] = [];
    const light = token.lightEmission;
    const hasLight = !!light && light.enabled && (light.brightRadius > 0 || light.dimRadius > 0);

    if (hasLight && light) {
      const brightPx = (light.brightRadius / 5) * pixelsPer5Ft;
      const totalPx = ((light.brightRadius + light.dimRadius) / 5) * pixelsPer5Ft;

      if (brightPx > 0) {
        brightPoly = computeRaycastPolygon(token.x, token.y, brightPx, obstacles);
        if (brightPoly.length >= 3) {
          composite.brightPolygons.push(brightPoly);
        }
      }

      if (totalPx > brightPx) {
        dimPoly = computeRaycastPolygon(token.x, token.y, totalPx, obstacles);
        if (dimPoly.length >= 3) {
          composite.dimPolygons.push(dimPoly);
        }
      }
    }

    composite.tokenResults.push({
      tokenId: token.id,
      tokenName: token.name,
      isPlayer: !!token.isPlayer,
      visionPolygon: visionPoly,
      brightLightPolygon: brightPoly,
      dimLightPolygon: dimPoly,
      lightColor: light?.color ?? '#ffaa44',
      hasLight,
    });
  }

  // Also include light emission from any other revealed NPC/monster token carrying an active light
  const nonPartyLightTokens = tokens.filter(
    (t) => !activeTokens.includes(t) && t.isRevealed !== false && t.lightEmission?.enabled
  );

  for (const token of nonPartyLightTokens) {
    const light = token.lightEmission;
    if (!light || (!light.brightRadius && !light.dimRadius)) continue;

    const brightPx = (light.brightRadius / 5) * pixelsPer5Ft;
    const totalPx = ((light.brightRadius + light.dimRadius) / 5) * pixelsPer5Ft;

    if (brightPx > 0) {
      const brightPoly = computeRaycastPolygon(token.x, token.y, brightPx, obstacles);
      if (brightPoly.length >= 3) {
        composite.brightPolygons.push(brightPoly);
      }
    }

    if (totalPx > brightPx) {
      const dimPoly = computeRaycastPolygon(token.x, token.y, totalPx, obstacles);
      if (dimPoly.length >= 3) {
        composite.dimPolygons.push(dimPoly);
      }
    }
  }

  return composite;
}
