// maritimeEngine.ts — Deep-Water Coastal Navigation & 13-Cycle Lunar Weather Engine
// Codifies sailing speeds, Rucean lunar weather hazards, and waterborne vehicle check resolutions.

export type VesselTypeId = 'coastal_caravel' | 'rucean_merchant_cog' | 'war_galley';

export interface VesselSpecification {
  id: VesselTypeId;
  name: string;
  speedMilesPerDay: number;
  minimumCrew: number;
  cargoCapacityTons: number;
  hullAc: number;
  hullHp: number;
  description: string;
}

export const VESSEL_SPECS: Record<VesselTypeId, VesselSpecification> = {
  coastal_caravel: {
    id: 'coastal_caravel',
    name: 'Coastal Caravel',
    speedMilesPerDay: 40,
    minimumCrew: 12,
    cargoCapacityTons: 50,
    hullAc: 15,
    hullHp: 100,
    description: 'Nimble double-masted vessel with lateen sails built for shallows and coastal reefs.',
  },
  rucean_merchant_cog: {
    id: 'rucean_merchant_cog',
    name: 'Rucean Merchant Cog',
    speedMilesPerDay: 30,
    minimumCrew: 18,
    cargoCapacityTons: 150,
    hullAc: 14,
    hullHp: 140,
    description: 'Broad-beamed clinker-built merchant freight ship designed for bulk transport.',
  },
  war_galley: {
    id: 'war_galley',
    name: 'Concord War Galley',
    speedMilesPerDay: 45,
    minimumCrew: 40, // 30 rowers + 10 marines/deckhands
    cargoCapacityTons: 35,
    hullAc: 16,
    hullHp: 160,
    description: 'Oar-driven naval ram vessel delivering high sustained speeds independent of wind.',
  },
};

export type WeatherSeverity = 'Calm' | 'Rough Swell' | 'Sudden Gale' | 'White Squall';

export interface MaritimeWeatherEvent {
  roll: number;
  severity: WeatherSeverity;
  label: string;
  targetDc: number | null; // null if calm
  hullDamageFormula: string | null;
  speedMultiplierOnFail: number;
  crewCasualtyRisk: boolean;
  flavorNotes: string;
}

/**
 * Evaluates the daily maritime weather hazard keyed to the Rucean 13-cycle maritime lunar calendar.
 * Roll 1d20 daily during open-water transit:
 * 1-12: Calm / Fair (No check needed; full progress)
 * 13-16: Rough Swell (DC 13 Waterborne Vehicles check)
 * 17-19: Sudden Gale (DC 16 check; 1d4 structural hull damage on fail)
 * 20: White Squall / Rogue Wave (DC 18 check; mast snap and crew swept overboard checks)
 */
export function rollDailyMaritimeHazard(forcedRoll?: number): MaritimeWeatherEvent {
  const roll = forcedRoll !== undefined
    ? Math.max(1, Math.min(20, forcedRoll))
    : Math.floor(Math.random() * 20) + 1;

  if (roll <= 12) {
    return {
      roll,
      severity: 'Calm',
      label: 'Calm Waters & Fair Trade Winds',
      targetDc: null,
      hullDamageFormula: null,
      speedMultiplierOnFail: 1.0,
      crewCasualtyRisk: false,
      flavorNotes: 'Favorable winds fill the sails. Steady wake and clear horizons across the archipelago.',
    };
  }

  if (roll <= 16) {
    return {
      roll,
      severity: 'Rough Swell',
      label: 'Heavy Swell & Choppy Shallows',
      targetDc: 13,
      hullDamageFormula: null,
      speedMultiplierOnFail: 0.5,
      crewCasualtyRisk: false,
      flavorNotes: 'Rolling tidal swells batter the prow. Helm must maintain heading against choppy drift.',
    };
  }

  if (roll <= 19) {
    return {
      roll,
      severity: 'Sudden Gale',
      label: 'Sudden Archipelago Gale',
      targetDc: 16,
      hullDamageFormula: '1d4',
      speedMultiplierOnFail: 0.25,
      crewCasualtyRisk: false,
      flavorNotes: 'Squalling cross-winds threaten to breach the bulwarks. Rigging groans under storm strain.',
    };
  }

  // Roll 20: White Squall / Rogue Wave
  return {
    roll,
    severity: 'White Squall',
    label: 'White Squall & Rogue Wave',
    targetDc: 18,
    hullDamageFormula: '2d6',
    speedMultiplierOnFail: 0.0,
    crewCasualtyRisk: true,
    flavorNotes: 'Towering anomalous wave crests without warning. Potential mast snap and deck sweep.',
  };
}

export interface HazardResolutionResult {
  passed: boolean;
  checkRoll: number;
  targetDc: number;
  hullDamageSustained: number;
  effectiveMilesTraveled: number;
  crewOverboardCount: number;
  message: string;
}

/**
 * Resolves a navigator's Waterborne Vehicles check against a weather hazard.
 */
export function resolveHazardCheck(
  event: MaritimeWeatherEvent,
  checkRoll: number,
  vessel: VesselSpecification
): HazardResolutionResult {
  // If weather is calm, auto-pass with full daily speed
  if (event.targetDc === null) {
    return {
      passed: true,
      checkRoll,
      targetDc: 0,
      hullDamageSustained: 0,
      effectiveMilesTraveled: vessel.speedMilesPerDay,
      crewOverboardCount: 0,
      message: `${vessel.name} sailed unimpeded across calm waters (${vessel.speedMilesPerDay} miles).`,
    };
  }

  const passed = checkRoll >= event.targetDc;

  if (passed) {
    return {
      passed: true,
      checkRoll,
      targetDc: event.targetDc,
      hullDamageSustained: 0,
      effectiveMilesTraveled: vessel.speedMilesPerDay,
      crewOverboardCount: 0,
      message: `Vehicles Check ${checkRoll} vs DC ${event.targetDc} PASSED! Helmsman skillfully outmaneuvered the ${event.severity}. Full sailing progress (${vessel.speedMilesPerDay} miles).`,
    };
  }

  // Failed check: Calculate penalties and structural damage
  let hullDamage = 0;
  let crewOverboard = 0;

  if (event.severity === 'Sudden Gale') {
    // 1d4 hull damage
    hullDamage = Math.floor(Math.random() * 4) + 1;
  } else if (event.severity === 'White Squall') {
    // 2d6 hull damage + crew swept check
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    hullDamage = d1 + d2;
    // 1-2 crew members swept overboard on failed rogue wave check
    crewOverboard = Math.floor(Math.random() * 2) + 1;
  }

  const effectiveMiles = Math.round(vessel.speedMilesPerDay * event.speedMultiplierOnFail);

  let msg = `Vehicles Check ${checkRoll} vs DC ${event.targetDc} FAILED against ${event.severity}! Progress reduced to ${effectiveMiles} miles.`;
  if (hullDamage > 0) {
    msg += ` Hull sustained ${hullDamage} structural bludgeoning damage.`;
  }
  if (crewOverboard > 0) {
    msg += ` CASUALTY: ${crewOverboard} crew member${crewOverboard > 1 ? 's were' : ' was'} swept overboard by the rogue wave!`;
  }

  return {
    passed: false,
    checkRoll,
    targetDc: event.targetDc,
    hullDamageSustained: hullDamage,
    effectiveMilesTraveled: effectiveMiles,
    crewOverboardCount: crewOverboard,
    message: msg,
  };
}
