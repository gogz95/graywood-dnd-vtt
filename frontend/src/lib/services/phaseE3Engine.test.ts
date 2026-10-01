// frontend/src/lib/services/phaseE3Engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  getReachableCells,
  smoothPath,
  type PathfindingOptions,
} from '../canvas/pathfindingEngine';
import {
  cubeLerp,
  cubeLinedraw,
  calculateHexCover,
} from '../canvas/gridCalculations';
import {
  calculateAppliedDamage,
  resolveDamageMatrix,
  calculateConcentrationDc,
  evaluateConcentrationTrigger,
  advanceTurnBuffDurations,
  type CreatureDamageAffinities,
  type ActiveSpellBuff,
} from './combatEngine';
import {
  getNextDoorState,
  toggleDoorById,
  isDoorPassable,
  getEffectiveMovementWalls,
  parseUvttAmbientLight,
} from '../canvas/interactiveObjects';
import type { DoorPrimitive } from '../canvas/parsers/dungeonScrawlParser';
import { hasVisualPerceptionDisadvantage } from '../canvas/weatherParticleLayer';

describe('Phase E3 Engine Integrations', () => {
  describe('BFS Reachability & Path Smoothing', () => {
    it('computes reachable cells within speed limit and respects walls', () => {
      const start = { gx: 2, gy: 2 };
      const options: PathfindingOptions = {
        cols: 10,
        rows: 10,
        gridSize: 50,
        allowDiagonal: false,
        walls: [
          // Wall blocking moving right to (3,2)
          {
            p1: { x: 150, y: 100 },
            p2: { x: 150, y: 150 },
            blocksVision: true,
            blocksMovement: true,
          },
        ],
      };

      const reachable5ft = getReachableCells(start, 5, options);
      // Can move up (2,1), down (2,3), left (1,2), but NOT right (3,2) due to wall
      const keys = reachable5ft.map((c) => `${c.gx},${c.gy}`);
      expect(keys).toContain('2,2');
      expect(keys).toContain('2,1');
      expect(keys).toContain('2,3');
      expect(keys).toContain('1,2');
      expect(keys).not.toContain('3,2');
    });

    it('multiplies movement cost by 2.0x in difficult terrain cells', () => {
      const start = { gx: 0, gy: 0 };
      const difficultTerrain = new Set<string>(['1,0']); // (1,0) is difficult terrain

      const options: PathfindingOptions = {
        cols: 5,
        rows: 5,
        gridSize: 50,
        allowDiagonal: false,
        difficultTerrain,
      };

      // Moving to (1,0) costs 5ft * 2 = 10ft
      // With remainingSpeed = 5ft, (1,0) should NOT be reachable
      const reachable5ft = getReachableCells(start, 5, options);
      const keys5 = reachable5ft.map((c) => `${c.gx},${c.gy}`);
      expect(keys5).not.toContain('1,0');

      // With remainingSpeed = 10ft, (1,0) SHOULD be reachable
      const reachable10ft = getReachableCells(start, 10, options);
      const keys10 = reachable10ft.map((c) => `${c.gx},${c.gy}`);
      expect(keys10).toContain('1,0');
    });

    it('smoothes paths by dropping intermediate waypoints when line of sight is clear', () => {
      // Orthogonal staircase path: (0,0) -> (1,0) -> (1,1)
      const raw = [
        { gx: 0, gy: 0, costFeet: 0 },
        { gx: 1, gy: 0, costFeet: 5 },
        { gx: 1, gy: 1, costFeet: 10 },
      ];

      // No walls: straight line of sight exists between (0,0) and (1,1)
      const smoothed = smoothPath(raw, [], 50);
      expect(smoothed.length).toBe(2);
      expect(smoothed[0]).toEqual({ gx: 0, gy: 0, costFeet: 0 });
      expect(smoothed[1].gx).toBe(1);
      expect(smoothed[1].gy).toBe(1);
    });
  });

  describe('Hex Cover Geometry', () => {
    it('interpolates cube coordinates and draws Bresenham hex line', () => {
      const a = { q: 0, r: 0, s: 0 };
      const b = { q: 2, r: -2, s: 0 };

      const line = cubeLinedraw(a, b);
      expect(line.length).toBe(3);
      expect(line[0]).toEqual(a);
      expect(line[2]).toEqual(b);
    });

    it('accurately resolves half, three-quarters, and total cover in hex combat', () => {
      const attacker = { q: 0, r: 0 };
      const defender = { q: 3, r: 0 };

      // 1 intervening obstacle
      const halfCover = calculateHexCover(attacker, defender, [{ q: 1, r: 0 }]);
      expect(halfCover.coverType).toBe('half');
      expect(halfCover.acBonus).toBe(2);
      expect(halfCover.canTarget).toBe(true);

      // 2 intervening obstacles out of 3: Three-Quarters cover (+5 AC)
      const defenderFar = { q: 4, r: 0 };
      const threeQuarters = calculateHexCover(attacker, defenderFar, [
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ]);
      expect(threeQuarters.coverType).toBe('three-quarters');
      expect(threeQuarters.acBonus).toBe(5);
      expect(threeQuarters.canTarget).toBe(true);

      // All intervening hexes obstructed (3 of 3): Total cover
      const totalCover = calculateHexCover(
        attacker,
        defenderFar,
        [
          { q: 1, r: 0 },
          { q: 2, r: 0 },
          { q: 3, r: 0 },
        ],
        []
      );
      expect(totalCover.coverType).toBe('total');
      expect(totalCover.canTarget).toBe(false);
    });
  });

  describe('5e Damage Affinity Matrix & Concentration', () => {
    it('applies exact affinity multipliers (Immunity 0.0, Resistance 0.5, Vulnerability 2.0)', () => {
      expect(calculateAppliedDamage(25, 'immunity')).toBe(0);
      expect(calculateAppliedDamage(25, 'resistance')).toBe(12); // floor(25 * 0.5) = 12
      expect(calculateAppliedDamage(25, 'vulnerability')).toBe(50); // floor(25 * 2.0) = 50
      expect(calculateAppliedDamage(25, 'none')).toBe(25);
    });

    it('resolves multi-type damage payloads against creature affinities', () => {
      const affinities: CreatureDamageAffinities = {
        immunities: ['poison'],
        resistances: ['fire'],
        vulnerabilities: ['cold'],
      };

      const result = resolveDamageMatrix(
        [
          { type: 'fire', amount: 21 }, // 21 * 0.5 = 10
          { type: 'cold', amount: 14 }, // 14 * 2.0 = 28
          { type: 'poison', amount: 15 }, // 15 * 0 = 0
          { type: 'slashing', amount: 8 }, // 8 * 1.0 = 8
        ],
        affinities
      );

      expect(result.totalRawDamage).toBe(58);
      expect(result.totalAppliedDamage).toBe(10 + 28 + 0 + 8); // 46
      expect(result.entries.find((e) => e.type === 'fire')?.applied).toBe(10);
      expect(result.entries.find((e) => e.type === 'cold')?.applied).toBe(28);
      expect(result.entries.find((e) => e.type === 'poison')?.applied).toBe(0);
    });

    it('calculates 5e Concentration DC = max(10, floor(damage / 2))', () => {
      expect(calculateConcentrationDc(5)).toBe(10);
      expect(calculateConcentrationDc(19)).toBe(10);
      expect(calculateConcentrationDc(20)).toBe(10);
      expect(calculateConcentrationDc(22)).toBe(11);
      expect(calculateConcentrationDc(35)).toBe(17);
    });

    it('triggers concentration check prompts only when concentrating', () => {
      const concentratingActor = {
        id: 'tok-1',
        name: 'Mage',
        conditions: ['Concentrating'],
      };
      const prompt = evaluateConcentrationTrigger(concentratingActor, 26);
      expect(prompt).not.toBeNull();
      expect(prompt?.dc).toBe(13);
      expect(prompt?.required).toBe(true);

      const nonConcentratingActor = {
        id: 'tok-2',
        name: 'Fighter',
        conditions: ['Prone'],
      };
      expect(evaluateConcentrationTrigger(nonConcentratingActor, 26)).toBeNull();
    });

    it('decrements active spell/buff durations and purges expired condition tags', () => {
      const buffs: ActiveSpellBuff[] = [
        { id: 'b-1', name: 'Shield of Faith', durationRounds: 1, conditionTag: 'Blessed' },
        { id: 'b-2', name: 'Haste', durationRounds: 3, conditionTag: 'Hastened' },
      ];
      const conditions = ['Blessed', 'Hastened', 'Prone'];

      const result = advanceTurnBuffDurations(buffs, conditions);

      expect(result.remainingBuffs.length).toBe(1);
      expect(result.remainingBuffs[0].id).toBe('b-2');
      expect(result.remainingBuffs[0].durationRounds).toBe(2);
      expect(result.expiredBuffs.length).toBe(1);
      expect(result.expiredBuffs[0].id).toBe('b-1');
      // 'Blessed' should be purged; 'Hastened' and 'Prone' remain
      expect(result.updatedConditions).toContain('Hastened');
      expect(result.updatedConditions).toContain('Prone');
      expect(result.updatedConditions).not.toContain('Blessed');
    });
  });

  describe('Interactive Doors & UVTT Ambient Light', () => {
    it('cycles door states (CLOSED -> OPEN -> LOCKED -> CLOSED)', () => {
      expect(getNextDoorState('CLOSED')).toBe('OPEN');
      expect(getNextDoorState('OPEN')).toBe('LOCKED');
      expect(getNextDoorState('LOCKED')).toBe('CLOSED');
    });

    it('dynamically drops open doors from pathfinding obstacle matrices', () => {
      const door: DoorPrimitive = {
        id: 'door-1',
        x1: 100,
        y1: 100,
        x2: 150,
        y2: 100,
        state: 'CLOSED',
      };

      // Closed door creates a wall
      const closedWalls = getEffectiveMovementWalls([], [door]);
      expect(closedWalls.length).toBe(1);

      // Open door is excluded
      const { updatedDoors } = toggleDoorById('door-1', [door]);
      expect(isDoorPassable(updatedDoors[0])).toBe(true);
      const openWalls = getEffectiveMovementWalls([], updatedDoors);
      expect(openWalls.length).toBe(0);
    });

    it('parses authored UVTT ambient_light colors', () => {
      expect(parseUvttAmbientLight({ ambient_light: '#1a1a2e' })).toBe('#1a1a2e');
      expect(parseUvttAmbientLight({ ambient_light: 'rgba(10, 15, 30, 0.7)' })).toBe(
        'rgba(10, 15, 30, 0.7)'
      );
      expect(parseUvttAmbientLight(undefined)).toBeNull();
    });
  });

  describe('Weather Particles & Visual Perception Disadvantage', () => {
    it('imposes visual perception disadvantage under heavy rain and dense fog', () => {
      expect(hasVisualPerceptionDisadvantage('rain', 0.8)).toBe(true);
      expect(hasVisualPerceptionDisadvantage('rain', 0.3)).toBe(false);
      expect(hasVisualPerceptionDisadvantage('fog', 0.5)).toBe(true);
      expect(hasVisualPerceptionDisadvantage('fog', 0.2)).toBe(false);
      expect(hasVisualPerceptionDisadvantage('snow', 0.9)).toBe(true);
      expect(hasVisualPerceptionDisadvantage('none', 1.0)).toBe(false);
    });
  });
});
