import { describe, it, expect } from 'vitest';
import {
  type WallSegment,
  type Ray,
  getObstacleSegments,
  castRayAgainstWalls,
} from './sanitizeGeometry';

describe('Doors & Raycasting Geometry', () => {
  const wall1: WallSegment = {
    id: 'wall-1',
    p1: { x: 100, y: 0 },
    p2: { x: 100, y: 100 },
  };

  const doorClosed: WallSegment = {
    id: 'door-closed',
    p1: { x: 100, y: 0 },
    p2: { x: 100, y: 100 },
    isDoor: true,
    doorState: 'closed',
  };

  const doorOpen: WallSegment = {
    id: 'door-open',
    p1: { x: 100, y: 0 },
    p2: { x: 100, y: 100 },
    isDoor: true,
    doorState: 'open',
  };

  const doorLocked: WallSegment = {
    id: 'door-locked',
    p1: { x: 100, y: 0 },
    p2: { x: 100, y: 100 },
    isDoor: true,
    doorState: 'locked',
  };

  const doorSecret: WallSegment = {
    id: 'door-secret',
    p1: { x: 100, y: 0 },
    p2: { x: 100, y: 100 },
    isDoor: true,
    doorState: 'secret',
  };

  const horizontalRay: Ray = {
    origin: { x: 0, y: 50 },
    direction: { x: 1, y: 0 },
  };

  it('excludes open doors from obstacle list', () => {
    const walls = [wall1, doorClosed, doorOpen, doorLocked, doorSecret];
    const obstacles = getObstacleSegments(walls);

    expect(obstacles.some((w) => w.id === 'door-open')).toBe(false);
    expect(obstacles.some((w) => w.id === 'door-closed')).toBe(true);
    expect(obstacles.some((w) => w.id === 'wall-1')).toBe(true);
    expect(obstacles.some((w) => w.id === 'door-locked')).toBe(true);
    expect(obstacles.some((w) => w.id === 'door-secret')).toBe(true);
  });

  it('open door segment returns zero intersections in raycasting', () => {
    const hits = castRayAgainstWalls(horizontalRay, [doorOpen]);
    expect(hits.length).toBe(0);
  });

  it('closed door segment blocks visibility rays and produces an intersection', () => {
    const hits = castRayAgainstWalls(horizontalRay, [doorClosed]);
    expect(hits.length).toBe(1);
    expect(hits[0].wall.id).toBe('door-closed');
    expect(hits[0].point.x).toBeCloseTo(100);
    expect(hits[0].point.y).toBeCloseTo(50);
    expect(hits[0].distance).toBeCloseTo(100);
  });

  it('locked and secret doors block visibility rays like closed walls', () => {
    const hitsLocked = castRayAgainstWalls(horizontalRay, [doorLocked]);
    expect(hitsLocked.length).toBe(1);
    expect(hitsLocked[0].wall.id).toBe('door-locked');

    const hitsSecret = castRayAgainstWalls(horizontalRay, [doorSecret]);
    expect(hitsSecret.length).toBe(1);
    expect(hitsSecret[0].wall.id).toBe('door-secret');
  });

  it('handles multiple walls correctly when doors open/close dynamically', () => {
    const walls = [
      { id: 'w-front', p1: { x: 50, y: 0 }, p2: { x: 50, y: 100 }, isDoor: true, doorState: 'closed' as const },
      { id: 'w-back', p1: { x: 150, y: 0 }, p2: { x: 150, y: 100 } },
    ];

    // Initially front door is closed -> hits front door
    let hits = castRayAgainstWalls(horizontalRay, walls);
    expect(hits.length).toBe(2);
    expect(hits[0].wall.id).toBe('w-front');

    // Open front door -> front door excluded, ray passes through to back wall
    walls[0].doorState = 'open';
    hits = castRayAgainstWalls(horizontalRay, walls);
    expect(hits.length).toBe(1);
    expect(hits[0].wall.id).toBe('w-back');
    expect(hits[0].point.x).toBeCloseTo(150);
  });
});
