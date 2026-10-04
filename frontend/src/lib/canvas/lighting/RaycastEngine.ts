// frontend/src/lib/canvas/lighting/RaycastEngine.ts
// Wall collider consumer and 2D raycasting engine for dynamic lighting and line-of-sight.
// Computes visibility polygons and shadow projections from hand-drawn vector walls.

import { computeViewport } from 'visibility-polygon';

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
   * Converts blocking wall colliders into visibility-polygon segment tuples [[x1, y1], [x2, y2]].
   */
  public getVisibilitySegments(
    bounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): [ [number, number], [number, number] ][] {
    const segments: [ [number, number], [number, number] ][] = [];

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
   * Calculates the 2D visibility polygon from an origin coordinate.
   */
  public computeVisibilityPolygon(
    origin: { x: number; y: number },
    radius: number,
    viewportBounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): [number, number][] {
    const bounds = viewportBounds || {
      minX: origin.x - radius,
      minY: origin.y - radius,
      maxX: origin.x + radius,
      maxY: origin.y + radius,
    };

    const segments = this.getVisibilitySegments(bounds);

    try {
      const polygon = computeViewport(
        [origin.x, origin.y],
        segments,
        [bounds.minX, bounds.minY],
        [bounds.maxX, bounds.maxY]
      );
      return polygon as [number, number][];
    } catch {
      return [];
    }
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
