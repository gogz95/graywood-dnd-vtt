// frontend/src/lib/services/phaseE4Engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculate3DDistanceFeet,
  validate3DAttackRange,
  calculateDropShadowParams,
  getElevationBadge,
} from '../canvas/elevationEngine';
import {
  isPointInPolygon,
  isTokenUnderRoof,
  updateRoofTileOpacities,
  type OverheadRoofTile,
} from '../canvas/OverheadTileLayer';
import {
  rollAutomatedInitiative,
  checkLegendaryActionOpportunity,
  checkFlankingAdvantage,
  type CombatLoopEntity,
} from './combatLoopEngine';
import {
  tokenizeDiceFormula,
  parseAndEvaluateDice,
  evaluateDiceGroup,
} from './diceParser';
import { calculateEqualPowerGains } from './audioStemMixer';
import {
  DARKVISION_FRAG_SHADER,
  BLINDSIGHT_FRAG_SHADER,
  MAGICAL_DARKNESS_FRAG_SHADER,
  createDefaultVisionUniforms,
} from '../canvas/shaders/VisionShaders';

describe('Phase E4 Next-Gen Simulation Integrations', () => {
  describe('3D Elevation & Range Geometry', () => {
    it('computes 3D Euclidean distance in feet factoring vertical z-axis', () => {
      // Ground distance: (3, 4) cells -> (15, 20) ft -> 25 ft ground
      // Elevation delta: 0 to 60 ft
      // 3D Distance = sqrt(25^2 + 60^2) = sqrt(625 + 3600) = sqrt(4225) = 65 ft
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 3, y: 4, z: 60 };

      const dist = calculate3DDistanceFeet(p1, p2, 5.0);
      expect(dist).toBeCloseTo(65.0, 1);
    });

    it('enforces range failures when 3D elevation exceeds reach despite 2D adjacency', () => {
      // Attacker on ground (0, 0, 0), flying enemy right above (0, 1, 30)
      // Ground distance = 5 ft (adjacent)
      // Height delta = 30 ft
      // 3D Distance = sqrt(5^2 + 30^2) = sqrt(25 + 900) ~ 30.41 ft
      const attacker = { x: 0, y: 0, z: 0 };
      const flyingTarget = { x: 0, y: 1, z: 30 };

      // Melee weapon with 5ft reach should fail
      const meleeValidation = validate3DAttackRange(attacker, flyingTarget, 5.0);
      expect(meleeValidation.inRange).toBe(false);
      expect(meleeValidation.failureReason).toContain('vertical elevation');

      // Ranged weapon with 60ft range should succeed
      const rangedValidation = validate3DAttackRange(attacker, flyingTarget, 60.0);
      expect(rangedValidation.inRange).toBe(true);
    });

    it('scales dynamic drop-shadow parameters with altitude', () => {
      const groundShadow = calculateDropShadowParams(0);
      expect(groundShadow.blur).toBe(3);
      expect(groundShadow.alpha).toBe(0.4);

      const elevatedShadow = calculateDropShadowParams(30);
      expect(elevatedShadow.blur).toBeGreaterThan(groundShadow.blur);
      expect(elevatedShadow.offsetY).toBeGreaterThan(groundShadow.offsetY);
      expect(elevatedShadow.alpha).toBeLessThan(groundShadow.alpha);
    });

    it('generates altitude badge text and styling', () => {
      expect(getElevationBadge(30).label).toBe('+30 ft');
      expect(getElevationBadge(30).isElevated).toBe(true);
      expect(getElevationBadge(-10).label).toBe('-10 ft');
      expect(getElevationBadge(-10).isSubterranean).toBe(true);
      expect(getElevationBadge(0).label).toBe('0 ft');
    });
  });

  describe('Overhead Tile Roof Occlusion', () => {
    it('detects point inside arbitrary 2D polygon using ray-casting', () => {
      const squarePoly = [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ];

      expect(isPointInPolygon(150, 150, squarePoly)).toBe(true);
      expect(isPointInPolygon(50, 150, squarePoly)).toBe(false);
      expect(isPointInPolygon(250, 250, squarePoly)).toBe(false);
    });

    it('smoothly fades roof tile opacity to 0.20 when occupied and restores to 1.0', () => {
      const tile: OverheadRoofTile = {
        id: 'roof-1',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        currentOpacity: 1.0,
        baseOpacity: 1.0,
        occludedOpacity: 0.20,
        fadeSpeed: 10.0,
      };

      // Token inside roof footprint: col 2.5 * 50 = 125 (inside 100..200)
      const insideToken = [{ x: 2.5, y: 2.5, sizeInCells: 1, isVisible: true }];
      updateRoofTileOpacities([tile], insideToken, 50, 0.1);
      expect(tile.currentOpacity).toBeLessThan(1.0);

      // Multiple frames to reach target
      for (let i = 0; i < 20; i++) {
        updateRoofTileOpacities([tile], insideToken, 50, 0.05);
      }
      expect(tile.currentOpacity).toBeCloseTo(0.20, 2);

      // Token leaves roof footprint
      const outsideToken = [{ x: 10, y: 10, sizeInCells: 1, isVisible: true }];
      for (let i = 0; i < 25; i++) {
        updateRoofTileOpacities([tile], outsideToken, 50, 0.05);
      }
      expect(tile.currentOpacity).toBeCloseTo(1.0, 2);
    });
  });

  describe('Combat Loop: Flanking, Lair & Legendary Actions', () => {
    it('detects geometric Flanking Advantage at opposite angles (135° to 225°)', () => {
      // Target at (5, 5)
      const target = { id: 't-1', name: 'Goblin Boss', x: 5, y: 5 };
      // Attacker 1 directly North at (5, 4) (1 cell away)
      const attacker = { id: 'p-1', name: 'Paladin', x: 5, y: 4 };
      // Ally directly South at (5, 6) (1 cell away) -> 180° opposite
      const allies = [{ id: 'r-1', name: 'Rogue', x: 5, y: 6, isConscious: true }];

      const result = checkFlankingAdvantage(attacker, target, allies, 1.5);
      expect(result.isFlanking).toBe(true);
      expect(result.angleDegrees).toBe(180);
      expect(result.allyId).toBe('r-1');

      // Ally at (6, 5) (90° orthogonal, not flanking)
      const nonFlankingAllies = [{ id: 'r-2', name: 'Fighter', x: 6, y: 5, isConscious: true }];
      const nonFlankResult = checkFlankingAdvantage(attacker, target, nonFlankingAllies, 1.5);
      expect(nonFlankResult.isFlanking).toBe(false);
      expect(nonFlankResult.angleDegrees).toBe(0);
    });

    it('automatically inserts Lair Action at initiative count 20 losing all ties', () => {
      const entities: CombatLoopEntity[] = [
        { id: 'c-1', tokenId: 't1', name: 'Wizard', initiative: 22, dexMod: 2 },
        { id: 'c-2', tokenId: 't2', name: 'Ranger', initiative: 20, dexMod: 4 },
        { id: 'c-3', tokenId: 't3', name: 'Dragon Boss', initiative: 18, dexMod: 1, isBoss: true, hasLairActions: true },
        { id: 'c-4', tokenId: 't4', name: 'Fighter', initiative: 12, dexMod: 0 },
      ];

      const ordered = rollAutomatedInitiative(entities, false);
      const lairIdx = ordered.findIndex((e) => e.isLairEntry);

      expect(lairIdx).not.toBe(-1);
      expect(ordered[lairIdx].initiative).toBe(20);
      // Ranger rolled 20 with dexMod 4; Lair Action has dexMod -99 so it must follow Ranger
      const rangerIdx = ordered.findIndex((e) => e.name === 'Ranger');
      expect(lairIdx).toBeGreaterThan(rangerIdx);
      // Wizard rolled 22, so precedes Lair Action
      expect(ordered[0].name).toBe('Wizard');
    });

    it('triggers Legendary Action window at the end of other combatants turns', () => {
      const combatants: CombatLoopEntity[] = [
        { id: 'c-boss', tokenId: 'boss', name: 'Lich King', initiative: 18, dexMod: 2, isBoss: true, legendaryActionsRemaining: 3 },
        { id: 'c-player', tokenId: 'p1', name: 'Paladin', initiative: 15, dexMod: 1 },
      ];

      // Paladin finishes turn -> Lich King gets legendary prompt
      const prompt = checkLegendaryActionOpportunity('c-player', combatants);
      expect(prompt.canAct).toBe(true);
      expect(prompt.eligibleBosses.length).toBe(1);
      expect(prompt.eligibleBosses[0].name).toBe('Lich King');

      // Boss finishes their own turn -> No legendary prompt for themselves
      const bossSelf = checkLegendaryActionOpportunity('c-boss', combatants);
      expect(bossSelf.canAct).toBe(false);
    });
  });

  describe('AST Dice Parser Grammar', () => {
    it('correctly tokenizes complex dice formulas with modifiers', () => {
      const tokens = tokenizeDiceFormula('4d6kh3 + 2d20kl1 + 1d10! + 1d8!p + 1d12ro<2 + 5d10cs>=8');
      const types = tokens.map((t) => t.type);

      expect(types).toContain('DICE');
      expect(types).toContain('MOD_KEEP_HIGH');
      expect(types).toContain('MOD_KEEP_LOW');
      expect(types).toContain('MOD_EXPLODE');
      expect(types).toContain('MOD_EXPLODE_PENETRATING');
      expect(types).toContain('MOD_REROLL_ONCE');
      expect(types).toContain('MOD_COUNT_SUCCESS');
    });

    it('evaluates keep highest (kh) and drop lowest (dl) correctly', () => {
      // Deterministic rolls: [6, 5, 2, 1]
      const fakeRng = () => {
        const sequence = [0.99, 0.75, 0.25, 0.05];
        let idx = 0;
        return () => sequence[idx++];
      };

      const result = parseAndEvaluateDice('4d6kh3', fakeRng());
      // Rolls: 6, 5, 2, 1. Keep highest 3 -> 6 + 5 + 2 = 13
      expect(result.total).toBe(13);
    });

    it('evaluates exploding dice (!) on maximum face', () => {
      // Deterministic rolls: 6 on d6 (explodes), then 4
      const rolls = [0.99, 0.5];
      let i = 0;
      const rng = () => rolls[i++];

      const result = parseAndEvaluateDice('1d6!', rng);
      expect(result.total).toBe(10); // 6 + 4
      expect(result.steps[0].rolls.length).toBe(2);
      expect(result.steps[0].rolls[1].isExploded).toBe(true);
    });

    it('evaluates target successes (cs>=8)', () => {
      // Rolls: [2, 5, 8, 9, 10]
      const rolls = [0.1, 0.45, 0.75, 0.85, 0.95];
      let i = 0;
      const rng = () => rolls[i++];

      const result = parseAndEvaluateDice('5d10cs>=8', rng);
      // 8, 9, 10 are >= 8 -> 3 successes
      expect(result.total).toBe(3);
    });
  });

  describe('Audio Stem Mixer Equal-Power Crossfade', () => {
    it('satisfies equal-power constant acoustic energy: gainOut^2 + gainIn^2 = 1.0', () => {
      for (let p = 0; p <= 1.0; p += 0.1) {
        const { gainOut, gainIn } = calculateEqualPowerGains(p);
        const power = gainOut * gainOut + gainIn * gainIn;
        expect(power).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('GLSL Vision Shaders', () => {
    it('exports valid shader code strings and uniform defaults', () => {
      expect(DARKVISION_FRAG_SHADER).toContain('0.299');
      expect(BLINDSIGHT_FRAG_SHADER).toContain('uNeonColor');
      expect(MAGICAL_DARKNESS_FRAG_SHADER).toContain('uEdgeSoftness');

      const uniforms = createDefaultVisionUniforms();
      expect(uniforms.darkvision.brightnessBoost).toBe(1.45);
      expect(uniforms.blindsight.neonColor).toEqual([0.15, 0.95, 0.85]);
    });
  });
});
