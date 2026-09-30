// frontend/src/lib/canvas/pathfindingEngine.ts
// 2D A* Grid Pathfinding Engine with Line-of-Sight and Wall Collider Obstacle Sampling
// Supports orthogonal (Manhattan) and diagonal (Chebyshev/Octile) 5e movement rules.

import type { LineSegment, Point2D } from './raycastVisionEngine';

export interface GridCoord {
  gx: number;
  gy: number;
}

export interface PathWaypoint extends GridCoord {
  costFeet: number;
}

export interface PathfindingOptions {
  cols: number;
  rows: number;
  gridSize: number; // Pixels per grid cell
  allowDiagonal?: boolean;
  diagonal5105?: boolean; // D&D 5e variant: diagonal costs 5ft, then 10ft, then 5ft
  walls?: LineSegment[];
  tokenSizeCells?: number;
}

interface AStarNode {
  gx: number;
  gy: number;
  g: number; // Cost from start
  h: number; // Heuristic cost to target
  f: number; // g + h
  parent: AStarNode | null;
  diagonalSteps: number;
}

/**
 * Checks if a 2D line segment between two points intersects another 2D segment.
 */
function lineSegmentsIntersect(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
): boolean {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const det = d1x * d2y - d1y * d2x;
  if (Math.abs(det) < 1e-9) return false;

  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;

  const t = (dx * d2y - dy * d2x) / det;
  const u = (dx * d1y - dy * d1x) / det;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * NavGrid represents a 2D discrete collision matrix for fast A* graph search.
 */
export class NavGrid {
  public cols: number;
  public rows: number;
  public gridSize: number;
  private collisionMap: Uint8Array;

  constructor(cols: number, rows: number, gridSize: number) {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.gridSize = Math.max(1, gridSize);
    this.collisionMap = new Uint8Array(this.cols * this.rows);
  }

  public getIndex(gx: number, gy: number): number {
    return gy * this.cols + gx;
  }

  public isWithinBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows;
  }

  public isWalkable(gx: number, gy: number): boolean {
    if (!this.isWithinBounds(gx, gy)) return false;
    return this.collisionMap[this.getIndex(gx, gy)] === 0;
  }

  public setBlocked(gx: number, gy: number, blocked: boolean = true): void {
    if (this.isWithinBounds(gx, gy)) {
      this.collisionMap[this.getIndex(gx, gy)] = blocked ? 1 : 0;
    }
  }

  /**
   * Samples line-of-sight and door colliders across cells.
   * Marks cells whose boundary or center intersects a blocking wall or door.
   */
  public rasterizeWallObstacles(walls: LineSegment[]): void {
    if (!walls || walls.length === 0) return;

    const blockingWalls = walls.filter((w) => w.blocksMovement);
    if (blockingWalls.length === 0) return;

    for (const wall of blockingWalls) {
      // Bounding box of wall segment in cell coordinates
      const minGx = Math.max(0, Math.floor(Math.min(wall.p1.x, wall.p2.x) / this.gridSize));
      const maxGx = Math.min(this.cols - 1, Math.floor(Math.max(wall.p1.x, wall.p2.x) / this.gridSize));
      const minGy = Math.max(0, Math.floor(Math.min(wall.p1.y, wall.p2.y) / this.gridSize));
      const maxGy = Math.min(this.rows - 1, Math.floor(Math.max(wall.p1.y, wall.p2.y) / this.gridSize));

      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          const cellX1 = gx * this.gridSize;
          const cellY1 = gy * this.gridSize;
          const cellX2 = (gx + 1) * this.gridSize;
          const cellY2 = (gy + 1) * this.gridSize;

          // Test segment intersection against cell diagonals and perimeters
          const edges: [Point2D, Point2D][] = [
            [{ x: cellX1, y: cellY1 }, { x: cellX2, y: cellY1 }],
            [{ x: cellX2, y: cellY1 }, { x: cellX2, y: cellY2 }],
            [{ x: cellX2, y: cellY2 }, { x: cellX1, y: cellY2 }],
            [{ x: cellX1, y: cellY2 }, { x: cellX1, y: cellY1 }],
            [{ x: cellX1, y: cellY1 }, { x: cellX2, y: cellY2 }],
            [{ x: cellX1, y: cellY2 }, { x: cellX2, y: cellY1 }],
          ];

          for (const [e1, e2] of edges) {
            if (lineSegmentsIntersect(wall.p1, wall.p2, e1, e2)) {
              this.setBlocked(gx, gy, true);
              break;
            }
          }
        }
      }
    }
  }
}

/**
 * Heuristic estimation function: Octile distance for 8-directional movement,
 * Manhattan for 4-directional movement.
 */
export function calculateHeuristic(
  a: GridCoord,
  b: GridCoord,
  allowDiagonal: boolean = true,
): number {
  const dx = Math.abs(a.gx - b.gx);
  const dy = Math.abs(a.gy - b.gy);

  if (!allowDiagonal) {
    return (dx + dy) * 5; // Manhattan 5ft
  }

  // Octile heuristic (Chebyshev variation with diagonal cost = 1.414 * 5 or 7.07ft)
  const min = Math.min(dx, dy);
  const max = Math.max(dx, dy);
  return (min * 7.5) + (max - min) * 5;
}

/**
 * 2D A* Grid Pathfinding Engine:
 * Computes shortest obstacle-free trajectory between start and target cell coordinates.
 */
export function findPath(
  start: GridCoord,
  target: GridCoord,
  options: PathfindingOptions,
): PathWaypoint[] {
  const {
    cols,
    rows,
    gridSize,
    allowDiagonal = true,
    diagonal5105 = true,
    walls = [],
    tokenSizeCells = 1,
  } = options;

  const nav = new NavGrid(cols, rows, gridSize);
  nav.rasterizeWallObstacles(walls);

  // If start is target, return single point
  if (start.gx === target.gx && start.gy === target.gy) {
    return [{ gx: start.gx, gy: start.gy, costFeet: 0 }];
  }

  // If target cell is blocked, attempt to find nearest adjacent walkable cell
  let effectiveTarget = { ...target };
  if (!nav.isWalkable(effectiveTarget.gx, effectiveTarget.gy)) {
    const deltas = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
      { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
    ];
    let found = false;
    for (const d of deltas) {
      const nx = target.gx + d.dx;
      const ny = target.gy + d.dy;
      if (nav.isWalkable(nx, ny)) {
        effectiveTarget = { gx: nx, gy: ny };
        found = true;
        break;
      }
    }
    if (!found) return [];
  }

  const openList: AStarNode[] = [];
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    gx: start.gx,
    gy: start.gy,
    g: 0,
    h: calculateHeuristic(start, effectiveTarget, allowDiagonal),
    f: calculateHeuristic(start, effectiveTarget, allowDiagonal),
    parent: null,
    diagonalSteps: 0,
  };

  openList.push(startNode);

  // Neighbor offsets: Orthogonal + Diagonals
  const neighborOffsets: Array<{ dx: number; dy: number; isDiag: boolean }> = [
    { dx: 0, dy: -1, isDiag: false },
    { dx: 1, dy: 0, isDiag: false },
    { dx: 0, dy: 1, isDiag: false },
    { dx: -1, dy: 0, isDiag: false },
  ];

  if (allowDiagonal) {
    neighborOffsets.push(
      { dx: 1, dy: -1, isDiag: true },
      { dx: 1, dy: 1, isDiag: true },
      { dx: -1, dy: 1, isDiag: true },
      { dx: -1, dy: -1, isDiag: true },
    );
  }

  let finalNode: AStarNode | null = null;
  const maxIterations = 4000;
  let iterations = 0;

  while (openList.length > 0 && iterations < maxIterations) {
    iterations++;

    // Pick node with lowest f-score
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (
        openList[i].f < openList[lowestIdx].f ||
        (openList[i].f === openList[lowestIdx].f && openList[i].h < openList[lowestIdx].h)
      ) {
        lowestIdx = i;
      }
    }

    const current = openList.splice(lowestIdx, 1)[0];
    const key = `${current.gx},${current.gy}`;
    closedSet.add(key);

    // Target reached
    if (current.gx === effectiveTarget.gx && current.gy === effectiveTarget.gy) {
      finalNode = current;
      break;
    }

    for (const offset of neighborOffsets) {
      const neighborGx = current.gx + offset.dx;
      const neighborGy = current.gy + offset.dy;
      const neighborKey = `${neighborGx},${neighborGy}`;

      if (closedSet.has(neighborKey)) continue;

      // Check walkability considering creature footprint
      let canTraverse = true;
      for (let ox = 0; ox < tokenSizeCells; ox++) {
        for (let oy = 0; oy < tokenSizeCells; oy++) {
          if (!nav.isWalkable(neighborGx + ox, neighborGy + oy)) {
            canTraverse = false;
            break;
          }
        }
        if (!canTraverse) break;
      }

      if (!canTraverse) continue;

      // Diagonal corner-cutting prevention: don't squeeze between two blocking walls
      if (offset.isDiag) {
        const wallAdj1 = !nav.isWalkable(current.gx + offset.dx, current.gy);
        const wallAdj2 = !nav.isWalkable(current.gx, current.gy + offset.dy);
        if (wallAdj1 && wallAdj2) {
          continue;
        }
      }

      // Step cost calculation
      let stepCost = 5;
      let nextDiagCount = current.diagonalSteps;
      if (offset.isDiag) {
        nextDiagCount++;
        if (diagonal5105) {
          // 5-10-5 rule: every 2nd diagonal step costs 10ft instead of 5ft
          stepCost = nextDiagCount % 2 === 0 ? 10 : 5;
        } else {
          stepCost = 5; // Standard 5e lenient grid diagonal
        }
      }

      const tentativeG = current.g + stepCost;

      const existingNeighbor = openList.find(
        (n) => n.gx === neighborGx && n.gy === neighborGy,
      );

      if (!existingNeighbor) {
        const h = calculateHeuristic(
          { gx: neighborGx, gy: neighborGy },
          effectiveTarget,
          allowDiagonal,
        );
        openList.push({
          gx: neighborGx,
          gy: neighborGy,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
          diagonalSteps: nextDiagCount,
        });
      } else if (tentativeG < existingNeighbor.g) {
        existingNeighbor.g = tentativeG;
        existingNeighbor.f = tentativeG + existingNeighbor.h;
        existingNeighbor.parent = current;
        existingNeighbor.diagonalSteps = nextDiagCount;
      }
    }
  }

  if (!finalNode) {
    return [];
  }

  // Backtrack to assemble waypoints
  const waypoints: PathWaypoint[] = [];
  let curr: AStarNode | null = finalNode;
  while (curr) {
    waypoints.unshift({
      gx: curr.gx,
      gy: curr.gy,
      costFeet: curr.g,
    });
    curr = curr.parent;
  }

  return waypoints;
}

/**
 * Computes total movement distance in feet along an array of waypoints.
 */
export function calculatePathCostFeet(waypoints: PathWaypoint[]): number {
  if (waypoints.length <= 1) return 0;
  return waypoints[waypoints.length - 1].costFeet;
}
