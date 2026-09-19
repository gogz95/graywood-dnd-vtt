import { computeViewport, breakIntersections } from 'visibility-polygon';
import type { Token, Wall, MovementCollisionResult } from './types';

export type Point = [number, number];
export type Segment = [Point, Point];

/**
 * Filters walls that currently block line-of-sight vision.
 * Open doors do NOT block vision.
 */
export function filterVisionWalls(walls: Wall[]): Wall[] {
  return walls.filter((w) => w.blocksVision && !(w.isDoor && w.isOpen));
}

/**
 * Filters walls that currently obstruct physical token movement.
 * Open doors do NOT block movement.
 */
export function filterMovementWalls(walls: Wall[]): Wall[] {
  return walls.filter((w) => w.blocksMovement && !(w.isDoor && w.isOpen));
}

/**
 * Converts Wall entities to line segments for visibility-polygon raycasting.
 */
export function wallsToSegments(walls: Wall[]): Segment[] {
  return walls.map((w) => [
    [w.p1[0], w.p1[1]],
    [w.p2[0], w.p2[1]],
  ]);
}

/**
 * Deterministic 2D line segment intersection algorithm.
 * Returns the intersection coordinates if the segment between p1 and p2 intersects
 * the segment between p3 and p4, or null otherwise.
 */
export function checkLineIntersection(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): Point | null {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) {
    return null; // Collinear or parallel
  }

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    const ix = x1 + ua * (x2 - x1);
    const iy = y1 + ua * (y2 - y1);
    return [ix, iy];
  }

  return null;
}

/**
 * Checks whether a token movement trajectory from start (x1, y1) to end (x2, y2)
 * intersects any active movement-blocking wall or closed door.
 */
export function checkMovementCollision(
  start: Point,
  end: Point,
  walls: Wall[]
): MovementCollisionResult {
  const movementWalls = filterMovementWalls(walls);

  for (const wall of movementWalls) {
    const intersection = checkLineIntersection(start, end, wall.p1, wall.p2);
    if (intersection) {
      return {
        collides: true,
        hitWall: wall,
        intersectionPoint: intersection,
      };
    }
  }

  return {
    collides: false,
    hitWall: null,
    intersectionPoint: null,
  };
}

/**
 * Computes the 2D visibility polygon for a token using visibility-polygon raycasting.
 * If the token is orb-sealed, vision is completely extinguished (empty array).
 */
export function computeTokenVisibility(
  token: Token,
  walls: Wall[],
  mapBounds: { width: number; height: number }
): Point[] {
  if (token.isOrbSealed) {
    return [];
  }

  const visionWalls = filterVisionWalls(walls);
  const wallSegments = wallsToSegments(visionWalls);

  // Define effective bounding box for the raycasting viewport based on sightRadius
  const minX = Math.max(0, token.x - token.sightRadius);
  const minY = Math.max(0, token.y - token.sightRadius);
  const maxX = Math.min(mapBounds.width, token.x + token.sightRadius);
  const maxY = Math.min(mapBounds.height, token.y + token.sightRadius);

  const tokenOrigin: Point = [token.x, token.y];

  try {
    // Break intersecting segments to prevent degenerate geometry in visibility-polygon
    const brokenSegments = breakIntersections(wallSegments);
    const polygon = computeViewport(
      tokenOrigin,
      brokenSegments,
      [minX, minY],
      [maxX, maxY]
    );

    return polygon as Point[];
  } catch (err) {
    console.warn('Visibility polygon computation fallback for token:', token.id, err);
    // Radial circular fallback if raycasting library fails on degenerate collinear segments
    return generateRadialCircle(token.x, token.y, token.sightRadius, 32);
  }
}

/**
 * Generates regular polygon vertices approximating a circle for radial sight fallback.
 */
export function generateRadialCircle(
  cx: number,
  cy: number,
  radius: number,
  segments: number = 32
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}
