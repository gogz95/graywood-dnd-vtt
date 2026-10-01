// frontend/src/lib/canvas/interactiveObjects.ts
// Dynamic Interactive Doors & UVTT Ambient Lighting Handler
// Manages door portal toggling (Closed -> Open -> Locked) and live obstacle / shadow segment removal.

import type { DoorPrimitive, DoorState, WallSegment } from './parsers/dungeonScrawlParser';
import type { LineSegment } from './raycastVisionEngine';

export interface InteractiveDoor extends DoorPrimitive {
  isOpen: boolean;
  isLocked: boolean;
}

/**
 * Toggles a door's state:
 * - CLOSED -> OPEN
 * - OPEN -> LOCKED
 * - LOCKED -> CLOSED
 */
export function getNextDoorState(currentState: DoorState): DoorState {
  switch (currentState) {
    case 'CLOSED':
      return 'OPEN';
    case 'OPEN':
      return 'LOCKED';
    case 'LOCKED':
    default:
      return 'CLOSED';
  }
}

/**
 * Toggles the state of a specific door primitive by ID within a list of doors.
 * Returns the updated array and the toggled door primitive.
 */
export function toggleDoorById(
  doorId: string,
  doors: DoorPrimitive[]
): { updatedDoors: DoorPrimitive[]; toggledDoor: DoorPrimitive | null } {
  let toggled: DoorPrimitive | null = null;

  const updatedDoors = doors.map((door) => {
    if (door.id === doorId) {
      const nextState = getNextDoorState(door.state);
      toggled = {
        ...door,
        state: nextState,
        portalState: nextState.toLowerCase() as 'open' | 'closed' | 'locked',
      };
      return toggled;
    }
    return door;
  });

  return { updatedDoors, toggledDoor: toggled };
}

/**
 * Determines whether a door is passable by tokens.
 * Only 'OPEN' doors are passable.
 */
export function isDoorPassable(door: DoorPrimitive): boolean {
  return door.state === 'OPEN' || door.portalState === 'open';
}

/**
 * Filters and generates active movement blocking wall segments from walls and doors.
 * Dynamically drops open doors so pathfinding matrices update instantly without map reload.
 */
export function getEffectiveMovementWalls(
  walls: WallSegment[],
  doors: DoorPrimitive[]
): WallSegment[] {
  const result: WallSegment[] = [...walls];

  for (const door of doors) {
    if (!isDoorPassable(door)) {
      result.push({
        id: `door_wall_${door.id}`,
        x1: door.x1,
        y1: door.y1,
        x2: door.x2,
        y2: door.y2,
        color: door.state === 'LOCKED' ? '#dc2626' : '#94a3b8',
      });
    }
  }

  return result;
}

/**
 * Filters raycasting line segments for shadow and visibility calculations.
 * Excludes open doors so light and line-of-sight pass through without map reload.
 */
export function getEffectiveRaycastSegments(
  baseSegments: LineSegment[],
  doors: DoorPrimitive[]
): LineSegment[] {
  const result: LineSegment[] = [...baseSegments];

  for (const door of doors) {
    if (!isDoorPassable(door)) {
      result.push({
        p1: { x: door.x1, y: door.y1 },
        p2: { x: door.x2, y: door.y2 },
        blocksVision: true,
        blocksMovement: true,
      });
    }
  }

  return result;
}

/**
 * Checks if a pixel coordinate is within click tolerance of a door segment.
 */
export function isPointNearDoor(
  px: number,
  py: number,
  door: DoorPrimitive,
  tolerancePx: number = 20
): boolean {
  const dx = door.x2 - door.x1;
  const dy = door.y2 - door.y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(px - door.x1, py - door.y1) <= tolerancePx;
  }

  const t = Math.max(0, Math.min(1, ((px - door.x1) * dx + (py - door.y1) * dy) / lenSq));
  const projX = door.x1 + t * dx;
  const projY = door.y1 + t * dy;

  return Math.hypot(px - projX, py - projY) <= tolerancePx;
}

/**
 * Parses authored Universal VTT (UVTT) environment ambient light color.
 * Accepts formats: hex ('#0a0f1d'), rgba, or default fallback.
 */
export function parseUvttAmbientLight(
  environment?: { ambient_light?: string; baked_lighting?: boolean }
): string | null {
  if (!environment || !environment.ambient_light) {
    return null;
  }

  const raw = environment.ambient_light.trim();
  if (raw.startsWith('#') || raw.startsWith('rgb')) {
    return raw;
  }

  // If 8-character hex string without hash prefix
  if (/^[0-9a-fA-F]{6,8}$/.test(raw)) {
    return `#${raw.slice(0, 6)}`;
  }

  return raw;
}
