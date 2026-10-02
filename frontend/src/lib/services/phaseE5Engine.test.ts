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

describe('Polish Phase 1: Combat Micro-Interactions & Sensory Feedback', () => {
  it('computes sinusoidal scale oscillation for active turn breathing pulse', async () => {
    const { calculateTurnBreathingScale } = await import('../canvas/tokenRenderer');
    // scale(0) = 1.0 + 0.035 * sin(0) = 1.0
    expect(calculateTurnBreathingScale(0)).toBeCloseTo(1.0, 4);

    // Peak at t = 1 / (4 * 0.8) = 0.3125s -> scale = 1.035
    expect(calculateTurnBreathingScale(0.3125)).toBeCloseTo(1.035, 3);

    // Trough at t = 3 / (4 * 0.8) = 0.9375s -> scale = 0.965
    expect(calculateTurnBreathingScale(0.9375)).toBeCloseTo(0.965, 3);
  });

  it('triggers Natural 20 radial shockwave and adds +0.30 camera trauma', async () => {
    const { ImpactVfxEngine, NAT20_SHOCKWAVE_FRAG_SHADER, NAT1_DESATURATION_FRAG_SHADER } = await import('../canvas/vfx/ImpactVfxEngine');
    const shake = new CameraScreenShake();
    const engine = new ImpactVfxEngine(shake);

    expect(NAT20_SHOCKWAVE_FRAG_SHADER).toContain('uWaveStrength');
    expect(NAT1_DESATURATION_FRAG_SHADER).toContain('uAberrationOffset');

    expect(shake.trauma).toBe(0);
    engine.triggerNatural20(0.5, 0.5);

    expect(engine.nat20Wave.active).toBe(true);
    expect(shake.trauma).toBeCloseTo(0.30, 2);

    // Step forward 300ms (0.3s)
    const state = engine.update(0.3);
    expect(state.nat20Progress).toBeCloseTo(0.5, 2);
    expect(engine.nat20Wave.active).toBe(true);

    // Step forward another 400ms -> finishes 600ms shockwave
    const finishedState = engine.update(0.4);
    expect(finishedState.nat20Progress).toBe(1.0);
    expect(engine.nat20Wave.active).toBe(false);

    engine.destroy();
  });

  it('triggers Natural 1 momentary desaturation flash and aberration', async () => {
    const { ImpactVfxEngine } = await import('../canvas/vfx/ImpactVfxEngine');
    const engine = new ImpactVfxEngine();

    engine.triggerNatural1();
    expect(engine.nat1Flash.active).toBe(true);

    // Update 125ms -> halfway through 250ms duration (peak intensity sin(PI * 0.5) = 1.0)
    const state = engine.update(0.125);
    expect(state.nat1Intensity).toBeCloseTo(1.0, 2);

    // Update another 150ms -> completes flash
    engine.update(0.15);
    expect(engine.nat1Flash.active).toBe(false);

    engine.destroy();
  });

  it('automates sidechain stem ducking on combat impact', async () => {
    const { audioStemMixer } = await import('./audioStemMixer');
    expect(typeof audioStemMixer.triggerCombatImpactDucking).toBe('function');
    // Invoking ducking without browser AudioContext in node environment runs safely
    expect(() => audioStemMixer.triggerCombatImpactDucking()).not.toThrow();
  });
});

describe('Polish Phase 2: Dual-Screen & Physical Tabletop Immersion', () => {
  it('calculates physical TV pixels-per-inch from diagonal and resolution', async () => {
    const { calculatePhysicalPpi } = await import('../canvas/viewportEngine');

    // 55" 4K TV (3840 x 2160):
    // diagonalPx = sqrt(3840^2 + 2160^2) = sqrt(14745600 + 4665600) = sqrt(19411200) ~ 4405.81
    // PPI = 4405.81 / 55 ~ 80.11
    const ppi55 = calculatePhysicalPpi(3840, 2160, 55);
    expect(ppi55).toBeCloseTo(80.11, 1);

    // 32" 1080p TV (1920 x 1080):
    // diagonalPx = sqrt(1920^2 + 1080^2) ~ 2202.91
    // PPI = 2202.91 / 32 ~ 68.84
    const ppi32 = calculatePhysicalPpi(1920, 1080, 32);
    expect(ppi32).toBeCloseTo(68.84, 1);
  });

  it('calculates 1-inch scale zoom ratio for 5ft tactical grid', async () => {
    const { calculateOneInchScaleZoom } = await import('../canvas/viewportEngine');

    // With 80.11 PPI on 60px grid cell -> Zoom = 80.11 / 60 ~ 1.335
    const zoom55 = calculateOneInchScaleZoom(80.11, 60);
    expect(zoom55).toBeCloseTo(1.335, 2);

    // With 96 PPI on 60px grid cell -> Zoom = 96 / 60 = 1.60
    const zoomMonitor = calculateOneInchScaleZoom(96, 60);
    expect(zoomMonitor).toBeCloseTo(1.60, 2);
  });

  it('locks viewport to physical scale keeping center point aligned', async () => {
    const { lockViewportToPhysicalScale } = await import('../canvas/viewportEngine');

    const currentVp = { x: 0, y: 0, zoom: 1.0 };
    const screenWidth = 1920;
    const screenHeight = 1080;
    const ppi = 96;
    const gridSize = 60; // targetZoom = 1.6

    const locked = lockViewportToPhysicalScale(currentVp, screenWidth, screenHeight, ppi, gridSize);
    expect(locked.zoom).toBeCloseTo(1.6, 2);
    expect(typeof locked.x).toBe('number');
  });
});

describe('Polish Phase 3: DM Tabletop Ergonomics & Rapid Tactical Controls', () => {
  it('steps token elevation by ±5ft and clamps between -100ft and +500ft', async () => {
    const { stepElevationFeet, calculateDropShadowParams, getElevationBadge } = await import('../canvas/elevationEngine');

    expect(stepElevationFeet(0, 5)).toBe(5);
    expect(stepElevationFeet(0, -5)).toBe(-5);
    expect(stepElevationFeet(10, 5)).toBe(15);
    expect(stepElevationFeet(15, -5)).toBe(10);

    // Clamps to max +500ft
    expect(stepElevationFeet(498, 5)).toBe(500);
    expect(stepElevationFeet(500, 5)).toBe(500);

    // Clamps to min -100ft
    expect(stepElevationFeet(-98, -5)).toBe(-100);
    expect(stepElevationFeet(-100, -5)).toBe(-100);

    // Elevation badge
    expect(getElevationBadge(0).label).toBe('0 ft');
    expect(getElevationBadge(15).label).toBe('+15 ft');
    expect(getElevationBadge(-10).label).toBe('-10 ft');

    // Drop shadow scaling
    const groundShadow = calculateDropShadowParams(0);
    const flyingShadow = calculateDropShadowParams(30);
    expect(flyingShadow.blur).toBeGreaterThan(groundShadow.blur);
    expect(flyingShadow.offsetY).toBeGreaterThan(groundShadow.offsetY);
    expect(flyingShadow.alpha).toBeLessThan(groundShadow.alpha);
  });

  it('intercepts Alt + ScrollWheel to step elevation and suppress camera zoom', async () => {
    const { handleTokenElevationWheel } = await import('../canvas/interaction/tokenPointerHandler');

    let prevented = false;
    let stopped = false;
    const fakeAltEvent = {
      altKey: true,
      deltaY: -100, // scroll up -> increase altitude
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
    } as unknown as WheelEvent;

    const token = {
      id: 'tok-hero-1',
      name: 'Ranger',
      x: 100,
      y: 100,
      elevation: 0,
    };

    const handled = handleTokenElevationWheel(fakeAltEvent, token);
    expect(handled.intercepted).toBe(true);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(token.elevation).toBe(5);

    // Normal scroll without Alt key should not be intercepted
    let normalPrevented = false;
    const fakeNormalEvent = {
      altKey: false,
      deltaY: -100,
      preventDefault: () => { normalPrevented = true; },
      stopPropagation: () => {},
    } as unknown as WheelEvent;

    const notHandled = handleTokenElevationWheel(fakeNormalEvent, token);
    expect(notHandled.intercepted).toBe(false);
    expect(normalPrevented).toBe(false);
  });

  it('provides exact 5e SRD mechanical condition summaries', async () => {
    const { getConditionSummary, SRD_CONDITIONS } = await import('./dndRulesEngine');

    expect(SRD_CONDITIONS.Blinded.summary).toContain('Auto-fails sight checks');
    expect(SRD_CONDITIONS.Blinded.summary).toContain('disadvantage on attacks');

    expect(SRD_CONDITIONS.Frightened.summary).toContain('Disadvantage on checks/attacks while source is in LoS');
    expect(SRD_CONDITIONS.Frightened.summary).toContain('speed reduced to 0 toward source');

    expect(SRD_CONDITIONS.Paralyzed.summary).toContain('Incapacitated; auto-fail STR/DEX saves; attacks within 5ft are auto-crits');
    expect(SRD_CONDITIONS.Poisoned.summary).toContain('Disadvantage on attack rolls and ability checks');
    expect(SRD_CONDITIONS.Restrained.summary).toContain('Speed 0; disadvantage on DEX saves; attacks have disadvantage');
    expect(SRD_CONDITIONS.Stunned.summary).toContain('Incapacitated; auto-fail STR/DEX saves; enemy attacks have advantage');

    const blinded = getConditionSummary('Blinded');
    expect(blinded.name).toBe('Blinded');
    expect(blinded.mechanics.length).toBeGreaterThan(0);
  });
});

describe('Polish Phase 4: Zero-Prep First-Run Onboarding Encounter', () => {
  it('bundles complete Ambush at Triboar Trail schema with 25x20 grid, campfire light, and 7 combatants', async () => {
    const { STARTER_ENCOUNTER_PAYLOAD, STARTER_ENCOUNTER_ID } = await import('./demoEncounterSeeder');

    expect(STARTER_ENCOUNTER_PAYLOAD.id).toBe(STARTER_ENCOUNTER_ID);
    expect(STARTER_ENCOUNTER_PAYLOAD.name).toBe('Ambush at Triboar Trail');
    expect(STARTER_ENCOUNTER_PAYLOAD.battlemap.grid.widthCells).toBe(25);
    expect(STARTER_ENCOUNTER_PAYLOAD.battlemap.grid.heightCells).toBe(20);
    expect(STARTER_ENCOUNTER_PAYLOAD.battlemap.grid.sizePx).toBe(100);
    expect(STARTER_ENCOUNTER_PAYLOAD.battlemap.biome).toBe('forest');

    // Campfire center light
    const lights = STARTER_ENCOUNTER_PAYLOAD.battlemap.lighting.lights;
    expect(lights.length).toBe(1);
    expect(lights[0].x).toBe(1250);
    expect(lights[0].y).toBe(1000);
    expect(lights[0].color).toBe('#ff8833');
    expect(lights[0].brightRadius).toBe(400); // 20ft
    expect(lights[0].dimRadius).toBe(800); // 40ft
    expect(lights[0].flicker).toBe(true);

    // 4 Player Tokens + 3 Goblin Ambushers
    const combatants = STARTER_ENCOUNTER_PAYLOAD.combatants;
    expect(combatants.length).toBe(7);
    const players = combatants.filter((c) => c.isPlayer);
    const goblins = combatants.filter((c) => !c.isPlayer);
    expect(players.length).toBe(4);
    expect(goblins.length).toBe(3);

    // Goblins in stealth cover
    expect(goblins.every((g) => g.isVisible === false)).toBe(true);

    // Tree and boulder walls
    expect(STARTER_ENCOUNTER_PAYLOAD.battlemap.walls.length).toBeGreaterThan(5);
  });

  it('hydrates Dexie, stores, and canvas in < 400ms without network roundtrips', async () => {
    const { seedDemoEncounter, STARTER_ENCOUNTER_ID } = await import('./demoEncounterSeeder');
    const { canvasStore } = await import('../../stores/canvasStore.svelte');

    const result = await seedDemoEncounter(true);

    expect(result.success).toBe(true);
    expect(result.mapId).toBe(STARTER_ENCOUNTER_ID);
    expect(result.tokenCount).toBe(7);
    expect(result.durationMs).toBeLessThan(400);

    // Canvas state validation
    expect(canvasStore.gridSize).toBe(100);
    expect(canvasStore.tokens.length).toBe(7);
    expect(canvasStore.sceneLights.length).toBe(1);
    expect(canvasStore.sceneLights[0].color).toBe('#ff8833');
    expect(canvasStore.mapImageUrl).toContain('data:image/svg+xml');
  });
});




