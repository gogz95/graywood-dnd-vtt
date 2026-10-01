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
  conditions?: string[]; // 5e condition penalties: 'prone', 'restrained', 'paralyzed', 'petrified', 'stunned', 'unconscious'
  difficultTerrain?: Set<string>; // Set of `${gx},${gy}` keys indicating difficult terrain (2.0x traversal cost)
}

/**
 * Evaluates 5e SRD condition movement speed modifiers:
 * - Prone: Halves movement speed (0.5x)
 * - Restrained, Paralyzed, Petrified, Stunned, Unconscious: Forces speed to 0
 */
export function calculateConditionSpeedMultiplier(conditions?: string[]): number {
  if (!conditions || conditions.length === 0) return 1.0;
  const normalized = conditions.map((c) => c.toLowerCase().trim());

  // Zero-speed conditions
  const zeroSpeedConditions = ['restrained', 'paralyzed', 'petrified', 'stunned', 'unconscious', 'grappled'];
  if (normalized.some((c) => zeroSpeedConditions.includes(c))) {
    return 0.0;
  }

  // Speed-halving conditions
  if (normalized.includes('prone')) {
    return 0.5;
  }

  return 1.0;
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
 * Calculates movement cost in feet according to DMG 5-10-5 diagonal rule.
 * Diagonal steps cost 5ft, then 10ft, then 5ft, then 10ft (alternating).
 */
export function calculate5105Cost(straightSteps: number, diagonalSteps: number): number {
  const straightFeet = straightSteps * 5;
  // Diagonals: each pair costs 15ft (5ft + 10ft). Odd remaining diagonal costs 5ft.
  const pairs = Math.floor(diagonalSteps / 2);
  const remainder = diagonalSteps % 2;
  const diagonalFeet = pairs * 15 + remainder * 5;
  return straightFeet + diagonalFeet;
}

/**
 * Heuristic estimation function:
 * - When diagonal5105 is enabled: DMG 5-10-5 alternating diagonal distance heuristic
 * - When allowDiagonal is true: Octile distance (7.5ft diagonal / 5ft straight)
 * - When allowDiagonal is false: Manhattan distance (5ft per orthogonal cell)
 */
export function calculateHeuristic(
  a: GridCoord,
  b: GridCoord,
  allowDiagonal: boolean = true,
  diagonal5105: boolean = false,
): number {
  const dx = Math.abs(a.gx - b.gx);
  const dy = Math.abs(a.gy - b.gy);

  if (!allowDiagonal) {
    return (dx + dy) * 5; // Manhattan 5ft
  }

  const diagonalSteps = Math.min(dx, dy);
  const straightSteps = Math.max(dx, dy) - diagonalSteps;

  if (diagonal5105) {
    return calculate5105Cost(straightSteps, diagonalSteps);
  }

  // Octile heuristic (Chebyshev variation with diagonal cost = 1.414 * 5 ~ 7.07ft -> 7.5ft)
  return (diagonalSteps * 7.5) + (straightSteps * 5);
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
    conditions = [],
  } = options;

  // 5e Condition speed check: if movement speed is reduced to 0, token cannot traverse
  if (calculateConditionSpeedMultiplier(conditions) === 0) {
    return [{ gx: start.gx, gy: start.gy, costFeet: 0 }];
  }

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

      // 5e Difficult Terrain: 2.0x traversal cost multiplier (10ft per 5ft cell)
      if (options.difficultTerrain?.has(neighborKey)) {
        stepCost *= 2.0;
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

// ═════════════════════════════════════════════════════════════════════════════
// JUMP POINT SEARCH (JPS) OPTIMIZATION FOR UNIFORM BATTLEMAP GRIDS
// (Adapted from qiao/PathFinding.js for 100x100+ open cell maps)
// ═════════════════════════════════════════════════════════════════════════════

interface JPSNode {
  gx: number;
  gy: number;
  g: number;
  h: number;
  f: number;
  parent: JPSNode | null;
}

/**
 * Searches in a direction (dx, dy) recursively to find a jump point.
 * A jump point is a node that has forced neighbors or is the target.
 */
function jump(
  nav: NavGrid,
  gx: number,
  gy: number,
  px: number,
  py: number,
  target: GridCoord
): GridCoord | null {
  const dx = gx - px;
  const dy = gy - py;

  if (!nav.isWalkable(gx, gy)) return null;
  if (gx === target.gx && gy === target.gy) return { gx, gy };

  // Check for forced neighbors
  if (dx !== 0 && dy !== 0) {
    // Diagonal jump
    if (
      (nav.isWalkable(gx - dx, gy + dy) && !nav.isWalkable(gx - dx, gy)) ||
      (nav.isWalkable(gx + dx, gy - dy) && !nav.isWalkable(gx, gy - dy))
    ) {
      return { gx, gy };
    }
    // Check horizontal and vertical components
    if (jump(nav, gx + dx, gy, gx, gy, target) || jump(nav, gx, gy + dy, gx, gy, target)) {
      return { gx, gy };
    }
  } else if (dx !== 0) {
    // Horizontal jump
    if (
      (nav.isWalkable(gx + dx, gy + 1) && !nav.isWalkable(gx, gy + 1)) ||
      (nav.isWalkable(gx + dx, gy - 1) && !nav.isWalkable(gx, gy - 1))
    ) {
      return { gx, gy };
    }
  } else if (dy !== 0) {
    // Vertical jump
    if (
      (nav.isWalkable(gx + 1, gy + dy) && !nav.isWalkable(gx + 1, gy)) ||
      (nav.isWalkable(gx - 1, gy + dy) && !nav.isWalkable(gx - 1, gy))
    ) {
      return { gx, gy };
    }
  }

  // Continue jumping in direction
  return jump(nav, gx + dx, gy + dy, gx, gy, target);
}

/**
 * Identifies successors of current node using JPS pruning rules.
 */
function findJPSSuccessors(
  nav: NavGrid,
  current: JPSNode,
  target: GridCoord
): GridCoord[] {
  const successors: GridCoord[] = [];
  const neighbors: { dx: number; dy: number }[] = [];

  if (current.parent) {
    const px = current.parent.gx;
    const py = current.parent.gy;
    const dx = Math.max(-1, Math.min(1, current.gx - px));
    const dy = Math.max(-1, Math.min(1, current.gy - py));

    if (dx !== 0 && dy !== 0) {
      // Diagonal
      if (nav.isWalkable(current.gx, current.gy + dy)) neighbors.push({ dx: 0, dy });
      if (nav.isWalkable(current.gx + dx, current.gy)) neighbors.push({ dx, dy: 0 });
      if (nav.isWalkable(current.gx + dx, current.gy + dy)) neighbors.push({ dx, dy });
      if (!nav.isWalkable(current.gx - dx, current.gy)) neighbors.push({ dx: -dx, dy });
      if (!nav.isWalkable(current.gx, current.gy - dy)) neighbors.push({ dx, dy: -dy });
    } else if (dx !== 0) {
      // Horizontal
      if (nav.isWalkable(current.gx + dx, current.gy)) neighbors.push({ dx, dy: 0 });
      if (!nav.isWalkable(current.gx, current.gy + 1)) neighbors.push({ dx, dy: 1 });
      if (!nav.isWalkable(current.gx, current.gy - 1)) neighbors.push({ dx, dy: -1 });
    } else if (dy !== 0) {
      // Vertical
      if (nav.isWalkable(current.gx, current.gy + dy)) neighbors.push({ dx: 0, dy });
      if (!nav.isWalkable(current.gx + 1, current.gy)) neighbors.push({ dx: 1, dy });
      if (!nav.isWalkable(current.gx - 1, current.gy)) neighbors.push({ dx: -1, dy });
    }
  } else {
    // Starting node: all 8 directions
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (nav.isWalkable(current.gx + dx, current.gy + dy)) {
          neighbors.push({ dx, dy });
        }
      }
    }
  }

  for (const n of neighbors) {
    const jumpPoint = jump(nav, current.gx + n.dx, current.gy + n.dy, current.gx, current.gy, target);
    if (jumpPoint) successors.push(jumpPoint);
  }

  return successors;
}

/**
 * Jump Point Search (JPS) pathfinder for large open battlemaps (bypasses uniform symmetric node expansions).
 */
export function findPathJPS(
  start: GridCoord,
  target: GridCoord,
  options: PathfindingOptions
): PathWaypoint[] {
  const { cols, rows, gridSize, walls = [] } = options;
  const nav = new NavGrid(cols, rows, gridSize);
  nav.rasterizeWallObstacles(walls);

  if (start.gx === target.gx && start.gy === target.gy) {
    return [{ gx: start.gx, gy: start.gy, costFeet: 0 }];
  }

  if (!nav.isWalkable(start.gx, start.gy) || !nav.isWalkable(target.gx, target.gy)) {
    // Fall back to standard A* with adjacent neighbor recovery
    return findPath(start, target, options);
  }

  const openList: JPSNode[] = [];
  const closedSet = new Set<string>();

  const startH = calculateHeuristic(start, target, true, true);
  openList.push({
    gx: start.gx,
    gy: start.gy,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
  });

  let finalNode: JPSNode | null = null;
  const maxIterations = 3000;
  let iters = 0;

  while (openList.length > 0 && iters++ < maxIterations) {
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[bestIdx].f) bestIdx = i;
    }

    const current = openList.splice(bestIdx, 1)[0];
    const key = `${current.gx},${current.gy}`;
    closedSet.add(key);

    if (current.gx === target.gx && current.gy === target.gy) {
      finalNode = current;
      break;
    }

    const successors = findJPSSuccessors(nav, current, target);
    for (const succ of successors) {
      const succKey = `${succ.gx},${succ.gy}`;
      if (closedSet.has(succKey)) continue;

      const dist = Math.hypot(succ.gx - current.gx, succ.gy - current.gy);
      const tentativeG = current.g + dist * 5;

      const existing = openList.find((n) => n.gx === succ.gx && n.gy === succ.gy);
      if (!existing) {
        const h = calculateHeuristic(succ, target, true, true);
        openList.push({
          gx: succ.gx,
          gy: succ.gy,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        });
      } else if (tentativeG < existing.g) {
        existing.g = tentativeG;
        existing.f = tentativeG + existing.h;
        existing.parent = current;
      }
    }
  }

  if (!finalNode) {
    // If JPS did not find path due to obstacle layout, fall back to standard A*
    return findPath(start, target, options);
  }

  // Trace back jump points
  const jumpWaypoints: PathWaypoint[] = [];
  let curr: JPSNode | null = finalNode;
  while (curr) {
    jumpWaypoints.unshift({ gx: curr.gx, gy: curr.gy, costFeet: curr.g });
    curr = curr.parent;
  }

  // Interpolate intermediate cells along jump vectors so UI shows continuous steps
  const fullWaypoints: PathWaypoint[] = [];
  for (let i = 0; i < jumpWaypoints.length; i++) {
    if (i === 0) {
      fullWaypoints.push(jumpWaypoints[0]);
      continue;
    }
    const prev = fullWaypoints[fullWaypoints.length - 1];
    const dest = jumpWaypoints[i];
    const dx = Math.sign(dest.gx - prev.gx);
    const dy = Math.sign(dest.gy - prev.gy);
    let stepX = prev.gx + dx;
    let stepY = prev.gy + dy;
    let accumulatedFeet = prev.costFeet;

    while (stepX !== dest.gx || stepY !== dest.gy) {
      const isDiag = dx !== 0 && dy !== 0;
      accumulatedFeet += isDiag ? 7.5 : 5;
      fullWaypoints.push({ gx: stepX, gy: stepY, costFeet: accumulatedFeet });
      if (stepX !== dest.gx) stepX += dx;
      if (stepY !== dest.gy) stepY += dy;
    }
    fullWaypoints.push(dest);
  }

  return fullWaypoints;
}

// ═════════════════════════════════════════════════════════════════════════════
// BFS REACHABILITY FOOTPRINT & PATH SMOOTHING (Adapted from qiao/PathFinding.js)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * BFS / Dijkstra reachability footprint:
 * Returns all grid coordinates reachable from startCell within remainingSpeed feet,
 * automatically terminating at impassable wall colliders and applying 2.0x difficult terrain costs.
 */
export function getReachableCells(
  startCell: GridCoord,
  remainingSpeed: number,
  options: PathfindingOptions,
  difficultTerrain?: Set<string>
): GridCoord[] {
  const {
    cols,
    rows,
    gridSize,
    allowDiagonal = true,
    diagonal5105 = true,
    walls = [],
    tokenSizeCells = 1,
    conditions = [],
  } = options;

  const diffSet = difficultTerrain || options.difficultTerrain || new Set<string>();

  if (calculateConditionSpeedMultiplier(conditions) === 0 || remainingSpeed <= 0) {
    return [startCell];
  }

  const nav = new NavGrid(cols, rows, gridSize);
  nav.rasterizeWallObstacles(walls);

  if (!nav.isWalkable(startCell.gx, startCell.gy)) {
    return [];
  }

  const minCostMap = new Map<string, number>();
  const startKey = `${startCell.gx},${startCell.gy}`;
  minCostMap.set(startKey, 0);

  interface ReachNode {
    gx: number;
    gy: number;
    cost: number;
    diagonalSteps: number;
  }
  const queue: ReachNode[] = [
    { gx: startCell.gx, gy: startCell.gy, cost: 0, diagonalSteps: 0 },
  ];

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
      { dx: -1, dy: -1, isDiag: true }
    );
  }

  while (queue.length > 0) {
    let lowestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].cost < queue[lowestIdx].cost) {
        lowestIdx = i;
      }
    }
    const current = queue.splice(lowestIdx, 1)[0];

    const currentBest = minCostMap.get(`${current.gx},${current.gy}`);
    if (currentBest !== undefined && current.cost > currentBest) {
      continue;
    }

    for (const offset of neighborOffsets) {
      const nx = current.gx + offset.dx;
      const ny = current.gy + offset.dy;
      const nKey = `${nx},${ny}`;

      if (!nav.isWithinBounds(nx, ny)) continue;

      let canTraverse = true;
      for (let ox = 0; ox < tokenSizeCells; ox++) {
        for (let oy = 0; oy < tokenSizeCells; oy++) {
          if (!nav.isWalkable(nx + ox, ny + oy)) {
            canTraverse = false;
            break;
          }
        }
        if (!canTraverse) break;
      }
      if (!canTraverse) continue;

      if (offset.isDiag) {
        const wallAdj1 = !nav.isWalkable(current.gx + offset.dx, current.gy);
        const wallAdj2 = !nav.isWalkable(current.gx, current.gy + offset.dy);
        if (wallAdj1 && wallAdj2) continue;
      }

      let stepCost = 5;
      let nextDiagCount = current.diagonalSteps;
      if (offset.isDiag) {
        nextDiagCount++;
        if (diagonal5105) {
          stepCost = nextDiagCount % 2 === 0 ? 10 : 5;
        } else {
          stepCost = 5;
        }
      }

      if (diffSet.has(nKey)) {
        stepCost *= 2.0;
      }

      const totalCost = current.cost + stepCost;
      if (totalCost <= remainingSpeed) {
        const recorded = minCostMap.get(nKey);
        if (recorded === undefined || totalCost < recorded) {
          minCostMap.set(nKey, totalCost);
          queue.push({
            gx: nx,
            gy: ny,
            cost: totalCost,
            diagonalSteps: nextDiagCount,
          });
        }
      }
    }
  }

  const results: GridCoord[] = [];
  for (const key of minCostMap.keys()) {
    const [gx, gy] = key.split(',').map(Number);
    results.push({ gx, gy });
  }
  return results;
}

/**
 * Executes string-pulling raycasting across non-adjacent waypoints:
 * If a straight line-of-sight ray between waypoint N and N+2 does not collide with wall segments,
 * drops intermediate waypoint N+1 to yield smooth natural diagonal movement.
 */
export function smoothPath(
  rawWaypoints: PathWaypoint[],
  walls: LineSegment[] = [],
  gridSize: number = 50
): PathWaypoint[] {
  if (rawWaypoints.length <= 2) return [...rawWaypoints];

  let path = [...rawWaypoints];
  let changed = true;
  let iterations = 0;
  const maxIterations = 20;

  const blockingWalls = walls.filter((w) => w.blocksMovement);

  function hasLineOfSight(p1: GridCoord, p2: GridCoord): boolean {
    if (blockingWalls.length === 0) return true;
    const pt1: Point2D = { x: (p1.gx + 0.5) * gridSize, y: (p1.gy + 0.5) * gridSize };
    const pt2: Point2D = { x: (p2.gx + 0.5) * gridSize, y: (p2.gy + 0.5) * gridSize };
    for (const wall of blockingWalls) {
      if (lineSegmentsIntersect(pt1, pt2, wall.p1, wall.p2)) {
        return false;
      }
    }
    return true;
  }

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    const smoothed: PathWaypoint[] = [];
    let i = 0;
    while (i < path.length) {
      smoothed.push(path[i]);
      if (i + 2 < path.length) {
        if (hasLineOfSight(path[i], path[i + 2])) {
          i += 2;
          changed = true;
          continue;
        }
      }
      i++;
    }
    path = smoothed;
  }

  // Recalculate costs along smoothed path
  let accumulatedCost = 0;
  let diagCount = 0;
  for (let i = 0; i < path.length; i++) {
    if (i === 0) {
      path[i] = { ...path[i], costFeet: 0 };
    } else {
      const prev = path[i - 1];
      const curr = path[i];
      const dx = Math.abs(curr.gx - prev.gx);
      const dy = Math.abs(curr.gy - prev.gy);
      const diag = Math.min(dx, dy);
      const straight = Math.max(dx, dy) - diag;
      for (let d = 0; d < diag; d++) {
        diagCount++;
        accumulatedCost += diagCount % 2 === 0 ? 10 : 5;
      }
      accumulatedCost += straight * 5;
      path[i] = { ...path[i], costFeet: accumulatedCost };
    }
  }

  return path;
}

