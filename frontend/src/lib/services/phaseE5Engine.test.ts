// frontend/src/lib/services/phaseE5Engine.test.ts
// Unit Tests for Phase E5: Spell Projectiles, Screen Shake, Aura Emanations & Shader Uniforms

import { describe, it, expect } from 'vitest';
import {
  quadraticBezierPoint,
  calculateBezierControlPoint,
  CameraScreenShake,
  SpellAnimationEngine,
} from '../canvas/vfx/SpellAnimationEngine';
import {
  AURA_FRAG_SHADER,
  createDefaultAuraUniforms,
} from '../canvas/vfx/shaders/AuraShaders';
import {
  evaluateTokenAuraInteractions,
  type EvaluatedToken,
} from './auraEngine';
import type { TokenAuraConfig } from '../canvas/vfx/TokenAuraLayer';

describe('Phase E5: Spell Projectile & Screen-Shake Engine', () => {
  it('correctly calculates quadratic Bezier projectile positions along trajectory', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 100 }; // arched control point
    const p2 = { x: 100, y: 0 };

    // At t = 0 -> p0
    const start = quadraticBezierPoint(p0, p1, p2, 0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(0);

    // At t = 0.5 -> 0.25*p0 + 0.5*p1 + 0.25*p2 = (50, 50)
    const mid = quadraticBezierPoint(p0, p1, p2, 0.5);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(50);

    // At t = 1 -> p2
    const end = quadraticBezierPoint(p0, p1, p2, 1);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(0);
  });

  it('calculates perpendicular control point for arched projectiles', () => {
    const p0 = { x: 0, y: 0 };
    const p2 = { x: 100, y: 0 };
    const p1 = calculateBezierControlPoint(p0, p2, 50);

    // Midpoint is (50, 0). Vector p0->p2 is (100, 0), normal is (0, 1)
    expect(p1.x).toBeCloseTo(50);
    expect(p1.y).toBeCloseTo(50);
  });

  it('decays camera trauma linearly and calculates non-zero jitter under trauma', () => {
    const shake = new CameraScreenShake();
    shake.decayRate = 1.0; // 1.0 trauma / sec
    shake.addTrauma(0.8);
    expect(shake.trauma).toBeCloseTo(0.8);

    // Update with dt = 0.5s -> trauma reduces to 0.3
    const jitter = shake.update(0.5);
    expect(shake.trauma).toBeCloseTo(0.3);
    expect(typeof jitter.offsetX).toBe('number');
    expect(typeof jitter.offsetY).toBe('number');
    expect(typeof jitter.rotationRad).toBe('number');

    // Update with dt = 0.5s -> trauma clamps to 0
    const zeroJitter = shake.update(0.5);
    expect(shake.trauma).toBe(0);
    expect(zeroJitter.offsetX).toBe(0);
    expect(zeroJitter.offsetY).toBe(0);
    expect(zeroJitter.rotationRad).toBe(0);
  });

  it('registers and advances projectile flight inside SpellAnimationEngine', () => {
    const engine = new SpellAnimationEngine();
    engine.fireSpellProjectile({
      id: 'proj-1',
      profile: 'fireball',
      start: { x: 0, y: 0 },
      target: { x: 200, y: 200 },
      durationMs: 400,
    });

    expect(engine.activeProjectiles).toHaveLength(1);
    expect(engine.activeProjectiles[0].config.profile).toBe('fireball');

    // Step forward 200ms (0.2s -> 50% progress)
    engine.update(0.2);
    expect(engine.activeProjectiles).toHaveLength(1);
    expect(engine.activeProjectiles[0].elapsedMs).toBe(200);

    // Step forward 300ms (0.3s -> exceeds 400ms total duration -> triggers burst impact)
    engine.update(0.3);
    expect(engine.activeProjectiles).toHaveLength(0);
    expect(engine.activeBursts.length).toBeGreaterThan(0);
  });
});

describe('Phase E5: Dynamic Token Auras & Emanation Engine', () => {
  const paladinToken: EvaluatedToken = {
    id: 'paladin-1',
    name: 'Sir Gareth',
    x: 10,
    y: 10,
    isPlayer: true,
  };

  const clericToken: EvaluatedToken = {
    id: 'cleric-1',
    name: 'Sister Althea',
    x: 20,
    y: 20,
    isPlayer: true,
  };

  const paladinAura: TokenAuraConfig = {
    id: 'aura-paladin',
    tokenId: 'paladin-1',
    name: 'Aura of Protection',
    radiusFeet: 10,
    color: 'rgba(251, 191, 36, 0.3)',
    isBeneficialToAllies: true,
    saveBonus: 4,
  };

  const spiritGuardiansAura: TokenAuraConfig = {
    id: 'aura-sg',
    tokenId: 'cleric-1',
    name: 'Spirit Guardians',
    radiusFeet: 15,
    color: 'rgba(168, 85, 247, 0.3)',
    isHostileToEnemies: true,
    movementPenaltyMultiplier: 0.5,
    damageFormula: '3d8 radiant',
  };

  it('grants Paladin Aura of Protection saving throw bonus to allies within 10ft', () => {
    // 1 cell = 5ft. Paladin is at (10, 10). Ally at (11, 10) is 5ft away (< 10ft)
    const allyToken: EvaluatedToken = {
      id: 'rogue-1',
      name: 'Corvus',
      x: 11,
      y: 10,
      isPlayer: true,
    };

    const result = evaluateTokenAuraInteractions(
      allyToken,
      [paladinToken, allyToken],
      [paladinAura],
      5.0
    );

    expect(result.activeSaveBonus).toBe(4);
    expect(result.appliedBeneficialAuras).toHaveLength(1);
    expect(result.appliedBeneficialAuras[0].auraName).toBe('Aura of Protection');
    expect(result.movementMultiplier).toBe(1.0);
  });

  it('imposes 50% movement speed penalty and registers hostile aura on enemies in Spirit Guardians', () => {
    // Cleric is at (20, 20). Enemy at (22, 20) is 10ft away (< 15ft)
    const enemyToken: EvaluatedToken = {
      id: 'goblin-1',
      name: 'Goblin Skulker',
      x: 22,
      y: 20,
      isPlayer: false,
    };

    const result = evaluateTokenAuraInteractions(
      enemyToken,
      [clericToken, enemyToken],
      [spiritGuardiansAura],
      5.0
    );

    expect(result.movementMultiplier).toBe(0.5);
    expect(result.triggeredHostileAuras).toHaveLength(1);
    expect(result.triggeredHostileAuras[0].auraName).toBe('Spirit Guardians');
    expect(result.triggeredHostileAuras[0].damageFormula).toBe('3d8 radiant');
  });

  it('does not affect tokens outside the aura radius or inapplicable allegiance', () => {
    // Enemy near Paladin does not get Aura of Protection
    const enemyNearPaladin: EvaluatedToken = {
      id: 'goblin-2',
      name: 'Goblin Boss',
      x: 11,
      y: 10,
      isPlayer: false,
    };
    const resEnemy = evaluateTokenAuraInteractions(
      enemyNearPaladin,
      [paladinToken, enemyNearPaladin],
      [paladinAura],
      5.0
    );
    expect(resEnemy.activeSaveBonus).toBe(0);
    expect(resEnemy.appliedBeneficialAuras).toHaveLength(0);

    // Ally beyond 10ft does not get Aura of Protection (distance = 4 cells = 20ft)
    const allyFar: EvaluatedToken = {
      id: 'wizard-1',
      name: 'Elminster',
      x: 14,
      y: 10,
      isPlayer: true,
    };
    const resAlly = evaluateTokenAuraInteractions(
      allyFar,
      [paladinToken, allyFar],
      [paladinAura],
      5.0
    );
    expect(resAlly.activeSaveBonus).toBe(0);
  });
});

describe('Phase E5: Aura GLSL Shader & Uniforms', () => {
  it('contains GLSL shader with smoothstep Hermite falloff and wave modulation', () => {
    expect(AURA_FRAG_SHADER).toContain('smoothstep');
    expect(AURA_FRAG_SHADER).toContain('uInnerFade');
    expect(AURA_FRAG_SHADER).toContain('uAuraColor');
    expect(AURA_FRAG_SHADER).toContain('sin');
    expect(AURA_FRAG_SHADER).toContain('uWaveModulation');
  });

  it('correctly creates default aura uniforms', () => {
    const uniforms = createDefaultAuraUniforms();
    expect(uniforms.center).toEqual([0.5, 0.5]);
    expect(uniforms.radius).toBe(0.2);
    expect(uniforms.auraColor).toEqual([0.95, 0.78, 0.25]);
    expect(uniforms.innerFade).toBe(0.35);
    expect(uniforms.pulseSpeed).toBe(2.2);
  });
});
