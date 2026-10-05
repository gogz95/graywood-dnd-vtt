// frontend/src/lib/canvas/RaycastEngine.ts
// 2D Radial Sweep Visibility Polygon & Raycasting Engine
// Computes line-of-sight visibility polygons against wall colliders and closed doors.

export interface WallCollider {
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  sense?: 'block' | 'pass';
  move?: 'block' | 'pass';
  isDoor?: boolean;
  isOpen?: boolean;
}

export type RaycastUpdateListener = (walls: WallCollider[]) => void;

interface RayIntersection {
  point: { x: number; y: number };
  param: number;
  angle: number;
}

export class RaycastEngine {
  private colliders: Map<string, WallCollider> = new Map();
  private listeners: Set<RaycastUpdateListener> = new Set();

  constructor(initialWalls: WallCollider[] = []) {
    this.addWalls(initialWalls);
  }

  public addWall(wall: WallCollider): void {
    if (!wall || !wall.p1 || !wall.p2) return;
    this.colliders.set(wall.id, {
      ...wall,
      sense: wall.sense ?? 'block',
      move: wall.move ?? 'block',
    });
    this.emitChange();
  }

  public addWalls(walls: WallCollider[]): void {
    if (!Array.isArray(walls)) return;
    for (const w of walls) {
      if (w && w.p1 && w.p2) {
        this.colliders.set(w.id, {
          ...w,
          sense: w.sense ?? 'block',
          move: w.move ?? 'block',
        });
      }
    }
    this.emitChange();
  }

  public removeWall(id: string): void {
    if (this.colliders.delete(id)) {
      this.emitChange();
    }
  }

  public clearWalls(): void {
    this.colliders.clear();
    this.emitChange();
  }

  public getWalls(): WallCollider[] {
    return Array.from(this.colliders.values());
  }

  /**
   * Converts blocking wall colliders into visibility segments [[x1, y1], [x2, y2]].
   */
  public getVisibilitySegments(
    bounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): [[number, number], [number, number]][] {
    const segments: [[number, number], [number, number]][] = [];

    for (const wall of this.colliders.values()) {
      if (wall.sense === 'pass') continue;
      if (wall.isDoor && wall.isOpen) continue;

      const p1x = Number(wall.p1.x);
      const p1y = Number(wall.p1.y);
      const p2x = Number(wall.p2.x);
      const p2y = Number(wall.p2.y);

      if (!isNaN(p1x) && !isNaN(p1y) && !isNaN(p2x) && !isNaN(p2y)) {
        segments.push([[p1x, p1y], [p2x, p2y]]);
      }
    }

    if (bounds) {
      const { minX, minY, maxX, maxY } = bounds;
      segments.push([[minX, minY], [maxX, minY]]);
      segments.push([[maxX, minY], [maxX, maxY]]);
      segments.push([[maxX, maxY], [minX, maxY]]);
      segments.push([[minX, maxY], [minX, minY]]);
    }

    return segments;
  }

  /**
   * Native 2D Radial Sweep Visibility Polygon Algorithm:
   * 1. Collects unique segment endpoints within the vision radius.
   * 2. Casts rays at angles theta - epsilon, theta, theta + epsilon.
   * 3. Intersects rays against all blocking segments:
   *      t = ((q - p) x s) / (r x s),  u = ((q - p) x r) / (r x s)
   * 4. Sorts intersection points angularly around origin (x, y) to construct a closed polygon.
   */
  public computeVisibilityPolygon(
    origin: { x: number; y: number },
    radius: number,
    viewportBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): [number, number][] {
    const r2 = radius * radius;
    const minX = viewportBounds ? viewportBounds.minX : origin.x - radius;
    const minY = viewportBounds ? viewportBounds.minY : origin.y - radius;
    const maxX = viewportBounds ? viewportBounds.maxX : origin.x + radius;
    const maxY = viewportBounds ? viewportBounds.maxY : origin.y + radius;

    // 1. Gather filtered segments (early-out bounding box culling)
    const activeSegments: Array<{ p1: { x: number; y: number }; p2: { x: number; y: number } }> = [];

    for (const wall of this.colliders.values()) {
      if (wall.sense === 'pass') continue;
      if (wall.isDoor && wall.isOpen) continue;

      const p1 = wall.p1;
      const p2 = wall.p2;

      // Bounding box culling against circle box
      const segMinX = Math.min(p1.x, p2.x);
      const segMaxX = Math.max(p1.x, p2.x);
      const segMinY = Math.min(p1.y, p2.y);
      const segMaxY = Math.max(p1.y, p2.y);

      if (segMaxX < minX || segMinX > maxX || segMaxY < minY || segMinY > maxY) {
        continue;
      }

      activeSegments.push({ p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y } });
    }

    // Add circular/box bounding boundary segments
    activeSegments.push(
      { p1: { x: minX, y: minY }, p2: { x: maxX, y: minY } },
      { p1: { x: maxX, y: minY }, p2: { x: maxX, y: maxY } },
      { p1: { x: maxX, y: maxY }, p2: { x: minX, y: maxY } },
      { p1: { x: minX, y: maxY }, p2: { x: minX, y: minY } }
    );

    // 2. Collect unique angles from segment endpoints
    const uniqueAngles: number[] = [];
    const eps = 0.0001;

    for (const seg of activeSegments) {
      for (const pt of [seg.p1, seg.p2]) {
        const dx = pt.x - origin.x;
        const dy = pt.y - origin.y;
        const angle = Math.atan2(dy, dx);
        uniqueAngles.push(angle - eps, angle, angle + eps);
      }
    }

    // Include 16 radial sweep intervals around circle
    const sweepSteps = 16;
    for (let i = 0; i < sweepSteps; i++) {
      uniqueAngles.push(-Math.PI + (i / sweepSteps) * 2 * Math.PI);
    }

    // Sort angles
    uniqueAngles.sort((a, b) => a - b);

    // 3. Cast rays and find closest intersection for each angle
    const intersections: RayIntersection[] = [];

    for (const angle of uniqueAngles) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      // Ray: p + t * r where r = (dx, dy), t >= 0
      let closestT = radius;
      let hitX = origin.x + dx * radius;
      let hitY = origin.y + dy * radius;

      for (const seg of activeSegments) {
        // Line-segment intersection:
        // p = origin, r = (dx, dy)
        // q = seg.p1, s = (seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y)
        const sx = seg.p2.x - seg.p1.x;
        const sy = seg.p2.y - seg.p1.y;

        const qpx = seg.p1.x - origin.x;
        const qpy = seg.p1.y - origin.y;

        const rCrossS = dx * sy - dy * sx;
        if (Math.abs(rCrossS) < 1e-8) {
          continue; // parallel
        }

        const t = (qpx * sy - qpy * sx) / rCrossS;
        const u = (qpx * dy - qpy * dx) / rCrossS;

        if (t >= 0 && t <= closestT && u >= 0 && u <= 1) {
          closestT = t;
          hitX = origin.x + dx * t;
          hitY = origin.y + dy * t;
        }
      }

      intersections.push({
        point: { x: hitX, y: hitY },
        param: closestT,
        angle,
      });
    }

    // 4. Return sorted polygon points
    return intersections.map((it) => [it.point.x, it.point.y]);
  }

  public onWallsChanged(listener: RaycastUpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    const currentWalls = this.getWalls();
    for (const listener of this.listeners) {
      try {
        listener(currentWalls);
      } catch (err) {
        console.warn('[RaycastEngine] Listener callback error:', err);
      }
    }
  }
}

export const raycastEngine = new RaycastEngine();
export default raycastEngine;
