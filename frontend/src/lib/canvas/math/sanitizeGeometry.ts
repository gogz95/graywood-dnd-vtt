// frontend/src/lib/canvas/math/sanitizeGeometry.ts
// Geometry sanitization, door state definitions, and line-of-sight raycast calculation.

export type DoorState = 'open' | 'closed' | 'locked' | 'secret';

export interface Point2D {
  x: number;
  y: number;
}

export interface WallSegment {
  p1: Point2D;
  p2: Point2D;
  id: string;
  isDoor?: boolean;
  doorState?: DoorState;
}

export interface Ray {
  origin: Point2D;
  direction: Point2D; // Normalized or non-zero direction vector
  maxDistance?: number;
}

export interface RayIntersection {
  point: Point2D;
  distance: number;
  wall: WallSegment;
}

/**
 * Filter wall segments that act as obstacles for raycasting / vision.
 * If isDoor === true and doorState === 'open', the segment MUST be excluded from the obstacle list (rays pass straight through).
 */
export function getObstacleSegments(walls: WallSegment[]): WallSegment[] {
  return walls.filter((w) => {
    if (!w) return false;
    if (w.isDoor === true && w.doorState === 'open') {
      return false;
    }
    return true;
  });
}

/**
 * Checks for line intersection between ray and segment p1-p2.
 */
function raySegmentIntersection(
  ray: Ray,
  p1: Point2D,
  p2: Point2D
): { point: Point2D; distance: number } | null {
  const r_px = ray.origin.x;
  const r_py = ray.origin.y;
  const r_dx = ray.direction.x;
  const r_dy = ray.direction.y;

  const s_px = p1.x;
  const s_py = p1.y;
  const s_dx = p2.x - p1.x;
  const s_dy = p2.y - p1.y;

  const r_mag = Math.hypot(r_dx, r_dy);
  const s_mag = Math.hypot(s_dx, s_dy);

  if (r_mag === 0 || s_mag === 0) return null;

  // Check parallel
  const det = r_dx * s_dy - r_dy * s_dx;
  if (Math.abs(det) < 1e-9) return null;

  const dx = s_px - r_px;
  const dy = s_py - r_py;

  const t1 = (dx * s_dy - dy * s_dx) / det;
  const t2 = (dx * r_dy - dy * r_dx) / det;

  if (t1 >= 0 && t2 >= 0 && t2 <= 1) {
    if (ray.maxDistance !== undefined && t1 > ray.maxDistance) {
      return null;
    }
    return {
      point: {
        x: r_px + t1 * r_dx,
        y: r_py + t1 * r_dy,
      },
      distance: t1,
    };
  }

  return null;
}

/**
 * Performs raycasting against wall segments.
 * Segments with isDoor === true and doorState === 'open' are excluded from collisions.
 */
export function castRayAgainstWalls(
  ray: Ray,
  walls: WallSegment[]
): RayIntersection[] {
  const obstacles = getObstacleSegments(walls);
  const hits: RayIntersection[] = [];

  for (const wall of obstacles) {
    const hit = raySegmentIntersection(ray, wall.p1, wall.p2);
    if (hit) {
      hits.push({
        point: hit.point,
        distance: hit.distance,
        wall,
      });
    }
  }

  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}
