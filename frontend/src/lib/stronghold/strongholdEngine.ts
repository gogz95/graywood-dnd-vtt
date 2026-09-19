// strongholdEngine.ts — Aleamos Stronghold, Room Point Progression, and Hireling Payroll Engine

export type StrongholdType = 'Outpost' | 'Guild Annex' | 'Estate' | 'Keep' | 'Fortress';
export type FacilityId = 'alchemy_lab' | 'forge' | 'chapel' | 'vault' | 'watchtower';

export interface FacilityDefinition {
  id: FacilityId;
  name: string;
  icon: string;
  rpCost: number;
  description: string;
  benefit: string;
  recommendedSkilledHirelings: number;
  recommendedUnskilledHirelings: number;
}

export interface UpgradeStep {
  fromRp: number;
  toRp: number;
  baseCostGp: number;
  days: number;
}

export interface StrongholdState {
  id: string;
  name: string;
  type: StrongholdType;
  currentRp: number; // 2 to 6
  facilities: FacilityId[];
  skilledHirelingsCount: number; // 2 gp/day
  unskilledHirelingsCount: number; // 0.2 gp (2 sp)/day
  daysUnpaid: number;
  treasuryGp: number;
  activeUpgrade: {
    targetRp: number;
    baseCostGp: number;
    finalCostGp: number;
    totalDays: number;
    daysCompleted: number;
    isUnderway: boolean;
    pcLaborLevelApplied: number;
  } | null;
}

export const UPGRADE_PROGRESSION: Record<number, UpgradeStep> = {
  2: { fromRp: 2, toRp: 3, baseCostGp: 10000, days: 40 },
  3: { fromRp: 3, toRp: 4, baseCostGp: 10000, days: 50 },
  4: { fromRp: 4, toRp: 5, baseCostGp: 10000, days: 50 },
  5: { fromRp: 5, toRp: 6, baseCostGp: 15000, days: 200 },
};

export const FACILITIES: Record<FacilityId, FacilityDefinition> = {
  alchemy_lab: {
    id: 'alchemy_lab',
    name: 'Alchemical Laboratory',
    icon: '⚗️',
    rpCost: 1,
    description: 'Distillation retorts, cold press extractors, and alembic chambers for essence refinement.',
    benefit: 'Unlocks Complex brews (> 25 Ingredient Points) in the Alchemy Workbench. Grants +2 on extraction synthesis.',
    recommendedSkilledHirelings: 1, // Alchemist
    recommendedUnskilledHirelings: 1, // Apprentice / Cleaner
  },
  forge: {
    id: 'forge',
    name: 'Arcane Greatforge',
    icon: '⚒️',
    rpCost: 1,
    description: 'Bellows-driven blast furnace with adamantine anvil and quenching troughs.',
    benefit: 'Enables masterwork weapon/armor crafting, heat-treating monster scales, and field repairs without downtime penalties.',
    recommendedSkilledHirelings: 1, // Master Smith
    recommendedUnskilledHirelings: 2, // Stoker & Apprentice
  },
  chapel: {
    id: 'chapel',
    name: 'Sanctified Chapel',
    icon: '⛪',
    rpCost: 1,
    description: 'Consecrated shrine imbued with permanent Hallow blessing and silvered candelabras.',
    benefit: 'Permanent Hallow effect wards against fiends and undead. Long rests restore +1 bonus Hit Die.',
    recommendedSkilledHirelings: 1, // Chaplain
    recommendedUnskilledHirelings: 1, // Acolyte
  },
  vault: {
    id: 'vault',
    name: 'Permafrost Vault',
    icon: '❄️',
    rpCost: 1,
    description: 'Subterranean reinforced cold cellar warded by glyphs of frost preservation.',
    benefit: 'Organic monster viscera and reagents stored here never decay (pauses the 24-hour decay timer). Capacity: 100,000 gp.',
    recommendedSkilledHirelings: 1, // Quartermaster
    recommendedUnskilledHirelings: 1, // Porter
  },
  watchtower: {
    id: 'watchtower',
    name: 'Garrisoned Watchtower',
    icon: '🏰',
    rpCost: 1,
    description: 'Elevated stone bastion with ballista mounts and panoramic regional sightlines.',
    benefit: 'Grants +2 passive perception on regional overland checks and 10-mile early alert against wandering monster incursions.',
    recommendedSkilledHirelings: 2, // Scout Captains
    recommendedUnskilledHirelings: 3, // Lookouts
  },
};

/**
 * Calculates the PC labor discount based on character level.
 * Rule: PC full labor reduces cost by half character level % (e.g. Level 8 -> 4% discount).
 */
export function calculateLaborDiscount(characterLevel: number): {
  discountPercent: number;
  calculateDiscountedCost: (baseCostGp: number) => number;
} {
  const lvl = Math.max(1, Math.min(20, characterLevel));
  const discountPercent = lvl * 0.5; // half level %

  const calculateDiscountedCost = (baseCostGp: number): number => {
    const discounted = baseCostGp * (1 - discountPercent / 100);
    return Math.max(0, Math.round(discounted));
  };

  return {
    discountPercent,
    calculateDiscountedCost,
  };
}

/**
 * Calculates daily and monthly payroll for skilled and unskilled hirelings.
 * Skilled: 2 gp/day
 * Unskilled: 2 sp (0.2 gp)/day
 */
export function calculatePayroll(skilledCount: number, unskilledCount: number): {
  skilledDailyGp: number;
  unskilledDailyGp: number;
  totalDailyGp: number;
  totalMonthlyGp: number;
} {
  const skilled = Math.max(0, skilledCount) * 2.0;
  const unskilled = Math.max(0, unskilledCount) * 0.2;
  const totalDaily = Number((skilled + unskilled).toFixed(2));
  const totalMonthly = Number((totalDaily * 30).toFixed(2));

  return {
    skilledDailyGp: skilled,
    unskilledDailyGp: unskilled,
    totalDailyGp: totalDaily,
    totalMonthlyGp: totalMonthly,
  };
}

/**
 * Evaluates desertion risks based on days unpaid.
 * Rule: Warns when payroll is unpaid, triggering desertion after 7 days.
 */
export function evaluateDesertionRisk(daysUnpaid: number): {
  isDesertionTriggered: boolean;
  status: 'Loyal' | 'Warning' | 'Critical' | 'Deserted';
  warningMessage: string;
} {
  const d = Math.max(0, daysUnpaid);

  if (d === 0) {
    return {
      isDesertionTriggered: false,
      status: 'Loyal',
      warningMessage: 'Payroll is fully paid. Staff morale is loyal and operations run at peak efficiency.',
    };
  }

  if (d < 4) {
    return {
      isDesertionTriggered: false,
      status: 'Warning',
      warningMessage: `Payroll overdue: ${d} day(s). Hireling grumbling noted. Pay before 7 days to avert desertion.`,
    };
  }

  if (d < 7) {
    const remaining = 7 - d;
    return {
      isDesertionTriggered: false,
      status: 'Critical',
      warningMessage: `CRITICAL ALERT: Payroll unpaid for ${d} days! Hirelings will abandon posts in ${remaining} day(s)!`,
    };
  }

  return {
    isDesertionTriggered: true,
    status: 'Deserted',
    warningMessage: 'DESERTION TRIGGERED: Payroll unpaid for 7+ days! Hirelings have deserted, leaving facilities offline and unattended.',
  };
}

/**
 * Calculates total allocated Room Points by active facilities.
 */
export function calculateAllocatedRp(facilities: FacilityId[]): number {
  return facilities.reduce((sum, fId) => {
    const def = FACILITIES[fId];
    return sum + (def ? def.rpCost : 0);
  }, 0);
}

/**
 * Calculates baseline and recommended hireling staffing based on upgraded Room Points (RP) and active facilities.
 * Formula:
 * - Baseline Skilled Hirelings: floor(currentRp / 2)
 * - Baseline Unskilled Laborers: currentRp
 * - Facility Recommended: Sum of active facilities recommended staffing
 */
export function calculateStaffingRequirements(currentRp: number, facilities: FacilityId[] = []): {
  baselineSkilled: number;
  baselineUnskilled: number;
  facilitySkilled: number;
  facilityUnskilled: number;
  recommendedSkilled: number;
  recommendedUnskilled: number;
} {
  const rp = Math.max(2, Math.min(6, currentRp));
  const baselineSkilled = Math.max(1, Math.floor(rp / 2));
  const baselineUnskilled = rp;

  let facilitySkilled = 0;
  let facilityUnskilled = 0;

  for (const fId of facilities) {
    const def = FACILITIES[fId];
    if (def) {
      facilitySkilled += def.recommendedSkilledHirelings;
      facilityUnskilled += def.recommendedUnskilledHirelings;
    }
  }

  return {
    baselineSkilled,
    baselineUnskilled,
    facilitySkilled,
    facilityUnskilled,
    recommendedSkilled: Math.max(baselineSkilled, facilitySkilled),
    recommendedUnskilled: Math.max(baselineUnskilled, facilityUnskilled),
  };
}
