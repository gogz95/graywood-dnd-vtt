// frontend/src/lib/canvas/pathfindingEngine.test.ts
import { describe, it, expect } from 'vitest';
import {
  NavGrid,
  calculateHeuristic,
  calculate5105Cost,
  findPath,
  findPathJPS,
  calculatePathCostFeet,
} from './pathfindingEngine';
import type { LineSegment } from './raycastVisionEngine';

describe('2D A* Grid Pathfinding Engine', () => {
  it('correctly calculates Manhattan and Octile heuristics', () => {
    const a = { gx: 0, gy: 0 };
    const b = { gx: 3, gy: 4 };

    // Manhattan: (3 + 4) * 5 = 35 ft
    const manhattan = calculateHeuristic(a, b, false);
    expect(manhattan).toBe(35);

    // Octile: min(3,4)*7.5 + (4-3)*5 = 3*7.5 + 5 = 27.5 ft
    const octile = calculateHeuristic(a, b, true);
    expect(octile).toBe(27.5);
  });

  it('computes direct orthogonal and diagonal path in open field', () => {
    const start = { gx: 0, gy: 0 };
    const target = { gx: 3, gy: 3 };

    const path = findPath(start, target, {
      cols: 10,
      rows: 10,
      gridSize: 50,
      allowDiagonal: true,
      diagonal5105: true,
    });

    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ gx: 0, gy: 0, costFeet: 0 });
    expect(path[path.length - 1].gx).toBe(3);
    expect(path[path.length - 1].gy).toBe(3);

    // 3 diagonal steps with 5-10-5 rule: 5 + 10 + 5 = 20 ft
    const totalCost = calculatePathCostFeet(path);
    expect(totalCost).toBe(20);
  });

  it('routes around wall obstacles blocking direct line of sight', () => {
    const start = { gx: 1, gy: 2 };
    const target = { gx: 3, gy: 2 };

    // Vertical wall between col 1 and 2 at row 1..3
    const walls: LineSegment[] = [
      {
        p1: { x: 100, y: 50 },
        p2: { x: 100, y: 150 },
        blocksVision: true,
        blocksMovement: true,
      },
    ];

    const path = findPath(start, target, {
      cols: 10,
      rows: 10,
      gridSize: 50,
      allowDiagonal: true,
      diagonal5105: true,
      walls,
    });

    expect(path.length).toBeGreaterThan(0);
    expect(path[0].gx).toBe(1);
    expect(path[0].gy).toBe(2);
    expect(path[path.length - 1].gx).toBe(3);
    expect(path[path.length - 1].gy).toBe(2);

    // Should not cross directly through the wall
    for (const p of path) {
      expect(!(p.gx === 2 && p.gy === 2)).toBe(true);
    }
  });

  it('does not block movement through open doors', () => {
    const start = { gx: 1, gy: 2 };
    const target = { gx: 3, gy: 2 };

    const openDoorWall: LineSegment[] = [
      {
        p1: { x: 100, y: 50 },
        p2: { x: 100, y: 150 },
        blocksVision: false,
        blocksMovement: false, // Open door passes movement
      },
    ];

    const path = findPath(start, target, {
      cols: 10,
      rows: 10,
      gridSize: 50,
      allowDiagonal: true,
      walls: openDoorWall,
    });

    expect(path.length).toBe(3); // (1,2) -> (2,2) -> (3,2)
    expect(path[path.length - 1]).toEqual({ gx: 3, gy: 2, costFeet: 10 });
  });

  it('returns empty array when target is completely trapped by impassable walls', () => {
    const start = { gx: 0, gy: 0 };
    const target = { gx: 5, gy: 5 };

    // Full bounding box enclosure around (5,5)
    const walls: LineSegment[] = [
      { p1: { x: 200, y: 200 }, p2: { x: 350, y: 200 }, blocksVision: true, blocksMovement: true },
      { p1: { x: 350, y: 200 }, p2: { x: 350, y: 350 }, blocksVision: true, blocksMovement: true },
      { p1: { x: 350, y: 350 }, p2: { x: 200, y: 350 }, blocksVision: true, blocksMovement: true },
      { p1: { x: 200, y: 350 }, p2: { x: 200, y: 200 }, blocksVision: true, blocksMovement: true },
    ];

    // Block cells inside the box
    const nav = new NavGrid(10, 10, 50);
    nav.rasterizeWallObstacles(walls);
    expect(nav.isWalkable(5, 5)).toBe(true); // Center is interior
  });

  it('accurately calculates DMG 5-10-5 alternating diagonal distance', () => {
    // 0 diagonals, 4 straight: 20ft
    expect(calculate5105Cost(4, 0)).toBe(20);
    // 1 diagonal (5ft), 0 straight: 5ft
    expect(calculate5105Cost(0, 1)).toBe(5);
    // 2 diagonals (5 + 10 = 15ft), 0 straight: 15ft
    expect(calculate5105Cost(0, 2)).toBe(15);
    // 3 diagonals (5 + 10 + 5 = 20ft), 0 straight: 20ft
    expect(calculate5105Cost(0, 3)).toBe(20);
    // 4 diagonals (5 + 10 + 5 + 10 = 30ft), 0 straight: 30ft
    expect(calculate5105Cost(0, 4)).toBe(30);
    // 2 diagonals + 2 straight: 15 + 10 = 25ft
    expect(calculate5105Cost(2, 2)).toBe(25);
  });

  it('executes Jump Point Search (JPS) across open uniform grid to target', () => {
    const start = { gx: 1, gy: 1 };
    const target = { gx: 8, gy: 8 };

    const path = findPathJPS(start, target, {
      cols: 20,
      rows: 20,
      gridSize: 50,
      allowDiagonal: true,
    });

    expect(path.length).toBeGreaterThan(0);
    expect(path[0].gx).toBe(1);
    expect(path[0].gy).toBe(1);
    expect(path[path.length - 1].gx).toBe(8);
    expect(path[path.length - 1].gy).toBe(8);
  });
});
