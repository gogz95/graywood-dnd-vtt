// src/lib/mechanics/travelCalculator.ts
// 5e Overland Travel Speed, Pacing, and Daily Resource Depletion Engine

export type TravelPace = 'fast' | 'normal' | 'slow';

export interface TravelPaceDetails {
  pace: TravelPace;
  milesPerHour: number;
  milesPerDay: number;
  effect: string;
  stealthAllowed: boolean;
  passivePerceptionMod: number;
}

export const TRAVEL_PACES: Record<TravelPace, TravelPaceDetails> = {
  fast: {
    pace: 'fast',
    milesPerHour: 4,
    milesPerDay: 30,
    effect: '-5 penalty to passive Wisdom (Perception) scores',
    stealthAllowed: false,
    passivePerceptionMod: -5,
  },
  normal: {
    pace: 'normal',
    milesPerHour: 3,
    milesPerDay: 24,
    effect: 'Standard ability checks and navigation',
    stealthAllowed: false,
    passivePerceptionMod: 0,
  },
  slow: {
    pace: 'slow',
    milesPerHour: 2,
    milesPerDay: 18,
    effect: 'Able to use stealth while traveling',
    stealthAllowed: true,
    passivePerceptionMod: 0,
  },
};

export interface TravelCalculationResult {
  distanceMiles: number;
  travelPace: TravelPace;
  hours: number;
  days: number;
  exactDays: number;
  stealthAllowed: boolean;
  passivePerceptionMod: number;
  resourceDeductions: {
    rationsPounds: number;
    waterGallons: number;
    partySize: number;
  };
  summaryText: string;
}

/**
 * Computes 5e overland travel time and party resource depletion based on measured route distance.
 *
 * @param pixelDistance Distance measured on canvas in pixels
 * @param scale Map scale containing unitsPerPixel and unitName (default miles)
 * @param pace Travel pace ('fast' | 'normal' | 'slow')
 * @param terrainMultiplier Terrain difficulty multiplier (1.0 = normal, 2.0 = difficult terrain/swamp/mountains)
 * @param partySize Number of creatures in party consuming food & water (default 4)
 */
export function calculateTravelTime(
  pixelDistance: number,
  scale: { unitsPerPixel: number; unitName?: string },
  pace: TravelPace = 'normal',
  terrainMultiplier: number = 1.0,
  partySize: number = 4
): TravelCalculationResult {
  const unitsPerPx = scale.unitsPerPixel > 0 ? scale.unitsPerPixel : 1;
  const distanceMiles = pixelDistance * unitsPerPx;
  const paceInfo = TRAVEL_PACES[pace] || TRAVEL_PACES.normal;

  // Effective travel speed factoring terrain difficulty
  const effectiveMph = Math.max(0.5, paceInfo.milesPerHour / Math.max(0.5, terrainMultiplier));
  const totalHours = distanceMiles / effectiveMph;

  // 5e standard: 8 hours of travel per day without forced march checks
  const exactDays = totalHours / 8;
  const days = Math.max(1, Math.ceil(exactDays));

  // 5e standard: 1 pound of food (ration) and 1 gallon of water per creature per day
  const rationsPounds = days * partySize;
  const waterGallons = days * partySize;

  const summaryText = `${distanceMiles.toFixed(1)} miles (${days} day${days > 1 ? 's' : ''}, ${totalHours.toFixed(1)} hrs at ${pace} pace)`;

  return {
    distanceMiles: Math.round(distanceMiles * 10) / 10,
    travelPace: pace,
    hours: Math.round(totalHours * 10) / 10,
    days,
    exactDays: Math.round(exactDays * 10) / 10,
    stealthAllowed: paceInfo.stealthAllowed,
    passivePerceptionMod: paceInfo.passivePerceptionMod,
    resourceDeductions: {
      rationsPounds,
      waterGallons,
      partySize,
    },
    summaryText,
  };
}
