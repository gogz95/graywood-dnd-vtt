import { describe, it, expect } from 'vitest';
import {
  createDefaultCharacter,
  performLongRest,
  castSpellSlot,
} from '../types/character';
import {
  computeRaycastVisibility,
  getWallRTree,
  queryWallsInRadius,
  type LineSegment,
} from '../canvas/raycastVisionEngine';
import {
  computeRaycastPolygon,
  getObstacleRTree,
  queryObstaclesInRadius,
  type LineSegment as ObstacleSegment,
} from '../services/visionRaycaster';

describe('5e Spell Slot Tracking & Cast Execution', () => {
  it('builds an explicit levels 1-9 slot pool on new actors', () => {
    const char = createDefaultCharacter('c-1', 'Valen', 'Wizard', 5);

    expect(Object.keys(char.spell_slots)).toHaveLength(9);
    for (const lvl of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
      expect(char.spell_slots[lvl]).toEqual({ current: 0, max: 0 });
    }
  });

  it('expends a leveled slot and mirrors the legacy spellcasting pool', () => {
    const char = createDefaultCharacter('c-2', 'Althaea', 'Wizard', 5);
    char.spell_slots[1] = { current: 2, max: 3 };
    char.spellcasting.slots[1] = { current: 2, max: 3 };

    const cast = castSpellSlot(char, 1);
    expect(cast.success).toBe(true);
    expect(cast.consumedSlot).toBe(true);
    expect(cast.slotLevel).toBe(1);
    expect(cast.remaining).toBe(1);
    expect(char.spell_slots[1].current).toBe(1);
    expect(char.spellcasting.slots[1].current).toBe(1);
  });

  it('blocks a leveled cast when current slots are exhausted (current <= 0)', () => {
    const char = createDefaultCharacter('c-3', 'Kaelen', 'Wizard', 5);
    char.spell_slots[2] = { current: 1, max: 1 };
    char.spellcasting.slots[2] = { current: 1, max: 1 };

    expect(castSpellSlot(char, 2).success).toBe(true);
    expect(char.spell_slots[2].current).toBe(0);

    const blocked = castSpellSlot(char, 2);
    expect(blocked.success).toBe(false);
    expect(blocked.reason).toBe('no_slots');
    expect(blocked.remaining).toBe(0);
    expect(blocked.consumedSlot).toBe(false);
    expect(char.spell_slots[2].current).toBe(0); // never goes negative

    // Level 3 was never stocked (0/0) so it is likewise blocked.
    const neverStocked = castSpellSlot(char, 3);
    expect(neverStocked.success).toBe(false);
    expect(neverStocked.reason).toBe('no_slots');
  });

  it('lets cantrips cast without expending any slot', () => {
    const char = createDefaultCharacter('c-4', 'Lyra', 'Wizard', 5);
    const cantrip = castSpellSlot(char, 0);

    expect(cantrip.success).toBe(true);
    expect(cantrip.consumedSlot).toBe(false);
    expect(cantrip.slotLevel).toBe(0);
    expect(char.spellcasting.slots[1].current).toBe(0);
  });

  it('lets rituals cast without expending any slot even when the level is drained', () => {
    const char = createDefaultCharacter('c-5', 'Fenwick', 'Wizard', 5);
    char.spell_slots[1] = { current: 0, max: 2 };
    char.spellcasting.slots[1] = { current: 0, max: 2 };

    const ritual = castSpellSlot(char, 1, { ritual: true });
    expect(ritual.success).toBe(true);
    expect(ritual.consumedSlot).toBe(false);
    expect(ritual.remaining).toBe(0);
    expect(char.spell_slots[1].current).toBe(0);
  });

  it('rejects out-of-range slot levels', () => {
    const char = createDefaultCharacter('c-6', 'Bramble', 'Wizard', 5);
    const invalid = castSpellSlot(char, 12);
    expect(invalid.success).toBe(false);
    expect(invalid.reason).toBe('invalid_level');
  });

  it('refills every slot level to max on a long rest', () => {
    const char = createDefaultCharacter('c-7', 'Mirabel', 'Cleric', 9);
    char.spell_slots[1] = { current: 0, max: 4 };
    char.spell_slots[3] = { current: 1, max: 2 };
    char.spellcasting.slots[1] = { current: 0, max: 4 };
    char.spellcasting.slots[3] = { current: 1, max: 2 };

    const rested = performLongRest(char);
    expect(rested.spell_slots[1]).toEqual({ current: 4, max: 4 });
    expect(rested.spell_slots[3]).toEqual({ current: 2, max: 2 });
    expect(rested.spellcasting.slots[1].current).toBe(4);
    expect(rested.spellcasting.slots[3].current).toBe(2);
  });
});

describe('R-Tree Raycast Broad Phase', () => {
  const origin = { x: 0, y: 0 };
  const radius = 100;

  // Near blocker, plus two distant walls that a brute-force sweep would still test.
  const walls: LineSegment[] = [
    { p1: { x: 50, y: -50 }, p2: { x: 50, y: 50 }, blocksVision: true, blocksMovement: true },
    { p1: { x: 5000, y: -50 }, p2: { x: 5000, y: 50 }, blocksVision: true, blocksMovement: true },
    { p1: { x: 20, y: 5000 }, p2: { x: 20, y: 5100 }, blocksVision: true, blocksMovement: true },
  ];

  it('queries only the walls inside the emitter bounding box', () => {
    expect(queryWallsInRadius(walls, origin, radius)).toEqual([walls[0]]);
  });

  it('memoizes the R-Tree per segment array and skips invalid segments', () => {
    expect(getWallRTree(walls)).toBe(getWallRTree(walls));

    const withInvalid = [
      { p1: { x: NaN, y: 0 }, p2: { x: 10, y: 10 }, blocksVision: true, blocksMovement: true },
      walls[0],
    ] as LineSegment[];
    expect(queryWallsInRadius(withInvalid, origin, radius)).toEqual([walls[0]]);
  });

  it('produces an identical vision polygon to a near-wall-only sweep', () => {
    const indexed = computeRaycastVisibility(origin, walls, radius);
    const nearOnly = computeRaycastVisibility(origin, [walls[0]], radius);

    expect(indexed.polygon.length).toBeGreaterThan(2);
    expect(indexed.polygon).toEqual(nearOnly.polygon);
  });

  it('still clips the raycast against the nearby wall and never exceeds the radius', () => {
    const vision = computeRaycastVisibility(origin, walls, radius);

    // Rays heading into the wall are clipped at x = 50
    expect(vision.polygon.some((p) => Math.abs(p.x - 50) < 1e-6)).toBe(true);

    for (const p of vision.polygon) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(radius + 0.01);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(radius + 0.01);
    }
  });
});

describe('R-Tree Broad Phase — services visionRaycaster', () => {
  it('queries the emitter bounding box and preserves polygon output', () => {
    const originX = 0;
    const originY = 0;
    const radius = 100;

    const obstacles: ObstacleSegment[] = [
      { x1: 50, y1: -50, x2: 50, y2: 50 },
      { x1: 5000, y1: -50, x2: 5000, y2: 50 },
      { x1: 20, y1: 5000, x2: 20, y2: 5100 },
    ];

    expect(queryObstaclesInRadius(obstacles, originX, originY, radius)).toEqual([obstacles[0]]);
    expect(getObstacleRTree(obstacles)).toBe(getObstacleRTree(obstacles));

    const indexed = computeRaycastPolygon(originX, originY, radius, obstacles);
    const nearOnly = computeRaycastPolygon(originX, originY, radius, [obstacles[0]]);

    expect(indexed).toEqual(nearOnly);
    expect(indexed.some((p) => Math.abs(p.x - 50) < 1e-6)).toBe(true);
  });
});
