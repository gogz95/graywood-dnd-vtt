import type { ElementalType } from '../components/crafting/alchemyMatrix';
import type { PartyStashItem } from '../../stores/sessionStore';

export type ElementalEssence = ElementalType;

export type CreatureSize = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';
export type HarvestSkill = 'Nature' | 'Survival' | 'Arcana' | 'Medicine';

export interface HarvestYieldItem {
  id: string;
  name: string;
  category: 'Organic Viscera' | 'Essence' | 'Trophy' | 'Reagent';
  essence?: ElementalEssence;
  quantity: number;
  weight: number;
  baseValueGp: number;
  isOrganic: boolean;
  description: string;
}

export interface HarvestCalculationResult {
  cr: number;
  size: CreatureSize;
  recommendedSkill: HarvestSkill;
  dcBySkill: Record<HarvestSkill, number>;
  baseDressMinutes: number;
  totalDressMinutes: number;
  formattedDressTime: string;
  potentialYields: HarvestYieldItem[];
}

export interface HarvestExecutionPayload {
  creatureName: string;
  creatureType: string;
  cr: number;
  size: CreatureSize;
  skillUsed: HarvestSkill;
  skillRoll: number;
  targetDc: number;
  isSuccess: boolean;
  degreesOfSuccess: number; // roll - targetDc
  appraisalPenaltyPercent: number; // 0% - 50% damage deduction
  harvestedAtHour: number;
  itemsHarvested: (HarvestYieldItem & {
    finalValueGp: number;
    harvestedAtHour: number;
    isPreserved: boolean;
    isSpoiled: boolean;
  })[];
}

export const SIZE_DC_MODIFIERS: Record<CreatureSize, number> = {
  Tiny: -2,
  Small: -1,
  Medium: 0,
  Large: 1,
  Huge: 2,
  Gargantuan: 4,
};

export const SIZE_DRESS_MINUTES: Record<CreatureSize, number> = {
  Tiny: 10,
  Small: 20,
  Medium: 45,
  Large: 120, // 2 hours
  Huge: 240,  // 4 hours
  Gargantuan: 480, // 8 hours
};

/**
 * Calculates extraction skill DCs for a creature based on CR and Size.
 * Formula: Base 10 + floor(CR / 2) + SizeModifier
 */
export function calculateHarvestDC(cr: number, size: CreatureSize, skill: HarvestSkill, creatureType: string = 'Beast'): number {
  const base = 10;
  const crMod = Math.floor(Math.max(0, cr) / 2);
  const sizeMod = SIZE_DC_MODIFIERS[size] ?? 0;
  let rawDc = base + crMod + sizeMod;

  // Slight skill specialization alignment based on creature category
  const normType = creatureType.toLowerCase();
  if (skill === 'Arcana') {
    if (['elemental', 'aberration', 'construct', 'dragon'].some(t => normType.includes(t))) {
      rawDc -= 1; // Favored skill bonus (lower DC)
    } else if (normType.includes('beast') || normType.includes('plant')) {
      rawDc += 2; // Unfavored skill penalty
    }
  } else if (skill === 'Nature') {
    if (['beast', 'plant', 'fey', 'monstrosity'].some(t => normType.includes(t))) {
      rawDc -= 1;
    } else if (normType.includes('construct') || normType.includes('aberration')) {
      rawDc += 2;
    }
  } else if (skill === 'Survival') {
    if (['beast', 'dragon', 'humanoid', 'giant'].some(t => normType.includes(t))) {
      rawDc -= 1;
    } else if (normType.includes('celestial') || normType.includes('aberration')) {
      rawDc += 2;
    }
  } else if (skill === 'Medicine') {
    if (['humanoid', 'undead', 'celestial', 'monstrosity'].some(t => normType.includes(t))) {
      rawDc -= 1;
    } else if (normType.includes('elemental') || normType.includes('construct')) {
      rawDc += 3;
    }
  }

  return Math.max(8, Math.min(30, rawDc));
}

/**
 * Calculates required field dressing time in minutes based on Size and CR.
 */
export function calculateDressMinutes(size: CreatureSize, cr: number): number {
  const baseMin = SIZE_DRESS_MINUTES[size] ?? 45;
  const extraMin = cr >= 10 ? Math.floor((cr - 10) / 5) * 30 + 30 : 0;
  return baseMin + extraMin;
}

/**
 * Formats minutes into human-readable hours and minutes.
 */
export function formatDressMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min`;
}

/**
 * Returns recommended skill for creature classification.
 */
export function getRecommendedSkill(creatureType: string): HarvestSkill {
  const t = creatureType.toLowerCase();
  if (['aberration', 'construct', 'elemental', 'dragon'].some(x => t.includes(x))) return 'Arcana';
  if (['undead', 'celestial', 'fiend'].some(x => t.includes(x))) return 'Medicine';
  if (['humanoid', 'giant'].some(x => t.includes(x))) return 'Survival';
  return 'Nature';
}

/**
 * Generates thematic organic viscera, proof, and elemental essences yields.
 */
export function generatePotentialYields(
  creatureName: string,
  creatureType: string,
  cr: number,
  size: CreatureSize
): HarvestYieldItem[] {
  const t = creatureType.toLowerCase();
  const yields: HarvestYieldItem[] = [];
  const crScale = Math.max(1, Math.min(10, Math.floor(cr / 2) + 1));

  // Determine potential elemental essence
  let primaryEssence: ElementalEssence = 'EARTH';
  if (t.includes('fire') || t.includes('red dragon') || t.includes('salamander') || t.includes('magma')) {
    primaryEssence = 'FIRE';
  } else if (t.includes('water') || t.includes('cold') || t.includes('blue dragon') || t.includes('ice') || t.includes('sea')) {
    primaryEssence = 'WATER';
  } else if (t.includes('air') || t.includes('lightning') || t.includes('storm') || t.includes('wind') || t.includes('bird')) {
    primaryEssence = 'AIR';
  } else if (t.includes('celestial') || t.includes('angel') || t.includes('radiant')) {
    primaryEssence = 'POSITIVE';
  } else if (t.includes('undead') || t.includes('necrotic') || t.includes('shadow') || t.includes('ghoul') || t.includes('zombie')) {
    primaryEssence = 'NEGATIVE';
  } else if (t.includes('aberration') || t.includes('chaos') || t.includes('slaad') || t.includes('demon')) {
    primaryEssence = 'CHAOS';
  } else if (t.includes('construct') || t.includes('modron') || t.includes('devil') || t.includes('order')) {
    primaryEssence = 'ORDER';
  } else {
    primaryEssence = 'EARTH';
  }

  // 1. Organic Viscera (Glands, Bile, Organs - subject to 24h decay)
  yields.push({
    id: `yield-organ-${Date.now()}-1`,
    name: `${creatureName} Alchemical Gland`,
    category: 'Organic Viscera',
    quantity: size === 'Gargantuan' || size === 'Huge' ? 2 : 1,
    weight: size === 'Tiny' ? 0.2 : size === 'Gargantuan' ? 8.0 : 1.5,
    baseValueGp: 15 * crScale,
    isOrganic: true,
    description: `Freshly extracted organ from ${creatureName}. Highly perishable; decays after 24 hours unless preserved.`,
  });

  // 2. Elemental Essence (Distillable in Alchemy Lab)
  yields.push({
    id: `yield-ess-${Date.now()}-2`,
    name: `${primaryEssence.charAt(0) + primaryEssence.slice(1).toLowerCase()} Essence (${creatureName})`,
    category: 'Essence',
    essence: primaryEssence,
    quantity: Math.max(1, Math.min(4, Math.floor(cr / 4) + 1)),
    weight: 0.5,
    baseValueGp: 25 * crScale,
    isOrganic: false,
    description: `Concentrated elemental ${primaryEssence} catalyst, suitable for the 28-essence synthesis matrix.`,
  });

  // 3. Trophy Proof / Hide (Non-organic pelt, chitin, or horn)
  yields.push({
    id: `yield-trophy-${Date.now()}-3`,
    name: `${creatureName} Hide & Proof`,
    category: 'Trophy',
    quantity: 1,
    weight: size === 'Tiny' ? 0.5 : size === 'Gargantuan' ? 25.0 : 5.0,
    baseValueGp: 20 * crScale,
    isOrganic: false,
    description: `Pelt, hide, or horn verifying the kill to local guilds and leatherworkers. Subject to appraisal deduction if damaged.`,
  });

  // 4. Higher CR bonus extraction (Bile / Ichor)
  if (cr >= 3) {
    yields.push({
      id: `yield-ichor-${Date.now()}-4`,
      name: `${creatureName} Concentrated Ichor`,
      category: 'Reagent',
      quantity: Math.floor(cr / 3),
      weight: 1.0,
      baseValueGp: 30 * crScale,
      isOrganic: true,
      description: `Potent viscous fluids extracted from vital veins. Perishable organic reagent.`,
    });
  }

  return yields;
}

/**
 * Calculates payout and value after applying the 0% - 50% appraisal penalty slider.
 * Formula: value * (1 - penaltyPercent / 100)
 */
export function calculateAppraisalPayout(baseValueGp: number, penaltyPercent: number): number {
  const clampedPenalty = Math.max(0, Math.min(50, penaltyPercent));
  const payout = baseValueGp * (1 - clampedPenalty / 100);
  return Math.max(1, Math.round(payout));
}

/**
 * Converts calendar state into a singular cumulative hour integer.
 */
export function getCalendarTotalHours(calendar: {
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentHour: number;
}): number {
  const y = calendar.currentYear ?? 1;
  const m = calendar.currentMonth ?? 0;
  const d = calendar.currentDay ?? 1;
  const h = calendar.currentHour ?? 0;
  return y * 360 * 24 + m * 30 * 24 + (d - 1) * 24 + h;
}

/**
 * Evaluates decay for a party stash item.
 * 24-Hour Decay Rule: If isOrganic && !isPreserved, when currentTotalHours - harvestedAtHour >= 24, it spoils.
 */
export function checkItemDecay(
  item: {
    name: string;
    isPreserved?: boolean;
    isSpoiled?: boolean;
    harvestedAtHour?: number;
    category?: string;
  },
  currentTotalHours: number
): {
  isSpoiled: boolean;
  hoursElapsed: number;
  hoursRemaining: number;
} {
  if (item.isPreserved) {
    return { isSpoiled: false, hoursElapsed: 0, hoursRemaining: 999 };
  }

  const harvestedAt = item.harvestedAtHour;
  if (harvestedAt === undefined || harvestedAt === null) {
    return { isSpoiled: !!item.isSpoiled, hoursElapsed: 0, hoursRemaining: 24 };
  }

  const hoursElapsed = Math.max(0, currentTotalHours - harvestedAt);
  const isSpoiled = hoursElapsed >= 24;
  const hoursRemaining = Math.max(0, 24 - hoursElapsed);

  return {
    isSpoiled,
    hoursElapsed,
    hoursRemaining,
  };
}

/**
 * Audits a party stash list and marks items that have exceeded 24 hours without preservation as "Spoiled".
 */
export function auditPartyStashDecay(
  stashItems: PartyStashItem[],
  currentTotalHours: number
): {
  updatedItems: PartyStashItem[];
  newlySpoiledCount: number;
} {
  let newlySpoiledCount = 0;

  const updatedItems = stashItems.map((item) => {
    // Only organic viscera / reagents with harvestedAtHour can spoil
    if (item.isPreserved || !item.harvestedAtHour) return item;
    if (item.isSpoiled) return item;

    const decay = checkItemDecay(item, currentTotalHours);
    if (decay.isSpoiled) {
      newlySpoiledCount++;
      return {
        ...item,
        isSpoiled: true,
        name: item.name.startsWith('Spoiled ') ? item.name : `Spoiled ${item.name}`,
        valueGp: 0,
        description: `${item.description} [SPOILED: Decayed past 24-hour viability window. Pungent and unusable for crafting.]`,
      };
    }

    return item;
  });

  return {
    updatedItems,
    newlySpoiledCount,
  };
}
