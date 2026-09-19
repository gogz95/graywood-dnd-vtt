// manaEngine.ts — Aleamos Mana Toxicity & Spell Slot Recovery Engine
// Regulates arcane potion consumption, spell slot replenishment, and Constitution-save Mana Toxicity.

export type ManaPotionTier = 'standard' | 'greater' | 'superior';

export interface ManaTierConfig {
  tier: ManaPotionTier;
  tierNumber: number; // 1, 2, 3
  label: string;
  formula: string;
  diceCount: number;
  dieSize: number;
  bonus: number;
  baseDc: number; // 12 + (tier * 2)
}

export const MANA_TIER_CONFIGS: Record<ManaPotionTier, ManaTierConfig> = {
  standard: {
    tier: 'standard',
    tierNumber: 1,
    label: 'Standard Mana Potion',
    formula: '1d4+1',
    diceCount: 1,
    dieSize: 4,
    bonus: 1,
    baseDc: 14, // 12 + (1 * 2)
  },
  greater: {
    tier: 'greater',
    tierNumber: 2,
    label: 'Greater Mana Potion',
    formula: '2d4+2',
    diceCount: 2,
    dieSize: 4,
    bonus: 2,
    baseDc: 16, // 12 + (2 * 2)
  },
  superior: {
    tier: 'superior',
    tierNumber: 3,
    label: 'Superior Mana Potion',
    formula: '3d4+4',
    diceCount: 3,
    dieSize: 4,
    bonus: 4,
    baseDc: 18, // 12 + (3 * 2)
  },
};

export interface CharacterManaTracking {
  potionsConsumedThisRest: number;
  isToxicLocked: boolean; // if true, cannot absorb mana points until long rest
  toxicitySaveRequired: boolean;
  pendingDc: number | null;
  exhaustionInflicted: number;
}

const manaTrackingByCharacter = new Map<string, CharacterManaTracking>();

/**
 * Calculates the DC for the Mana Toxicity Constitution saving throw: DC 12 + (tier * 2).
 */
export function calculateToxicityDc(tier: ManaPotionTier): number {
  const cfg = MANA_TIER_CONFIGS[tier];
  return 12 + (cfg.tierNumber * 2);
}

/**
 * Rolls mana recovery points for a potion tier.
 */
export function rollManaPotion(tier: ManaPotionTier): {
  tier: ManaPotionTier;
  points: number;
  rolls: number[];
  bonus: number;
  formula: string;
  label: string;
} {
  const cfg = MANA_TIER_CONFIGS[tier];
  const rolls: number[] = [];
  let sum = 0;

  for (let i = 0; i < cfg.diceCount; i++) {
    const r = Math.floor(Math.random() * cfg.dieSize) + 1;
    rolls.push(r);
    sum += r;
  }

  const points = sum + cfg.bonus;

  return {
    tier,
    points,
    rolls,
    bonus: cfg.bonus,
    formula: cfg.formula,
    label: cfg.label,
  };
}

export interface ManaConsumptionResult {
  success: boolean;
  pointsGranted: number;
  potionsConsumedTotal: number;
  toxicityTriggered: boolean;
  toxicityDc: number;
  conSavePassed?: boolean;
  exhaustionInflicted: number;
  isToxicLocked: boolean;
  message: string;
}

/**
 * Processes mana potion ingestion, tracking toxicity per long rest.
 * Rule: Consuming > 1 mana potion per Long Rest forces a CON saving throw (DC 12 + tier * 2).
 * Failure inflicts 1 level of Exhaustion and locks out further mana absorption until a Long Rest.
 */
export function consumeManaPotion(
  characterId: string,
  tier: ManaPotionTier,
  conSaveRoll?: number
): ManaConsumptionResult {
  let tracking = manaTrackingByCharacter.get(characterId);
  if (!tracking) {
    tracking = {
      potionsConsumedThisRest: 0,
      isToxicLocked: false,
      toxicitySaveRequired: false,
      pendingDc: null,
      exhaustionInflicted: 0,
    };
    manaTrackingByCharacter.set(characterId, tracking);
  }

  // If already locked out by toxicity failure, reject absorption
  if (tracking.isToxicLocked) {
    return {
      success: false,
      pointsGranted: 0,
      potionsConsumedTotal: tracking.potionsConsumedThisRest,
      toxicityTriggered: true,
      toxicityDc: calculateToxicityDc(tier),
      exhaustionInflicted: 0,
      isToxicLocked: true,
      message: 'Mana Toxicity Lock Active: Veins rejected alchemical draught. Complete a Long Rest to purge arcane reflux.',
    };
  }

  tracking.potionsConsumedThisRest += 1;
  const targetDc = calculateToxicityDc(tier);

  // First potion in a long rest is safe (no toxicity check needed)
  if (tracking.potionsConsumedThisRest === 1) {
    const rolled = rollManaPotion(tier);
    return {
      success: true,
      pointsGranted: rolled.points,
      potionsConsumedTotal: 1,
      toxicityTriggered: false,
      toxicityDc: targetDc,
      exhaustionInflicted: 0,
      isToxicLocked: false,
      message: `Safely ingested ${MANA_TIER_CONFIGS[tier].label}. Absorbed ${rolled.points} mana recovery points.`,
    };
  }

  // Second or subsequent potion: Toxicity save triggered!
  const rolled = rollManaPotion(tier);

  if (conSaveRoll === undefined) {
    // Save required but not provided yet
    tracking.toxicitySaveRequired = true;
    tracking.pendingDc = targetDc;
    return {
      success: false,
      pointsGranted: 0,
      potionsConsumedTotal: tracking.potionsConsumedThisRest,
      toxicityTriggered: true,
      toxicityDc: targetDc,
      exhaustionInflicted: 0,
      isToxicLocked: false,
      message: `Mana Toxicity Check Required! Roll Constitution saving throw (DC ${targetDc}) to absorb potion.`,
    };
  }

  const passed = conSaveRoll >= targetDc;

  if (passed) {
    tracking.toxicitySaveRequired = false;
    tracking.pendingDc = null;
    return {
      success: true,
      pointsGranted: rolled.points,
      potionsConsumedTotal: tracking.potionsConsumedThisRest,
      toxicityTriggered: true,
      toxicityDc: targetDc,
      conSavePassed: true,
      exhaustionInflicted: 0,
      isToxicLocked: false,
      message: `CON Save ${conSaveRoll} vs DC ${targetDc} Passed! Absorbed ${rolled.points} mana points despite toxicity strain.`,
    };
  } else {
    // FAILED: Inflict 1 level of Exhaustion and lock out further absorption until Long Rest
    tracking.isToxicLocked = true;
    tracking.exhaustionInflicted += 1;
    tracking.toxicitySaveRequired = false;
    tracking.pendingDc = null;

    return {
      success: false,
      pointsGranted: 0,
      potionsConsumedTotal: tracking.potionsConsumedThisRest,
      toxicityTriggered: true,
      toxicityDc: targetDc,
      conSavePassed: false,
      exhaustionInflicted: 1,
      isToxicLocked: true,
      message: `CON Save ${conSaveRoll} vs DC ${targetDc} FAILED! Suffered Mana Sickness: +1 Level of Exhaustion and absorption locked until Long Rest.`,
    };
  }
}

/**
 * Resets mana potion consumption and clears toxicity lock on Long Rest.
 */
export function resetLongRestManaTracking(characterId: string): void {
  manaTrackingByCharacter.set(characterId, {
    potionsConsumedThisRest: 0,
    isToxicLocked: false,
    toxicitySaveRequired: false,
    pendingDc: null,
    exhaustionInflicted: 0,
  });
}

/**
 * Recovers spell slots using available mana points (1 point per slot level).
 */
export function recoverSpellSlotWithPoints(
  slots: Array<{ level: number; total: number; used: number }>,
  targetLevel: number,
  pointsAvailable: number
): {
  updatedSlots: Array<{ level: number; total: number; used: number }>;
  remainingPoints: number;
  success: boolean;
  message: string;
} {
  const cost = targetLevel;
  if (pointsAvailable < cost) {
    return {
      updatedSlots: slots,
      remainingPoints: pointsAvailable,
      success: false,
      message: `Insufficient points: Level ${targetLevel} slot requires ${cost} points (have ${pointsAvailable}).`,
    };
  }

  const target = slots.find(s => s.level === targetLevel);
  if (!target || target.used <= 0) {
    return {
      updatedSlots: slots,
      remainingPoints: pointsAvailable,
      success: false,
      message: `Level ${targetLevel} slots are already fully replenished.`,
    };
  }

  const updatedSlots = slots.map(s => {
    if (s.level === targetLevel) {
      return { ...s, used: Math.max(0, s.used - 1) };
    }
    return s;
  });

  return {
    updatedSlots,
    remainingPoints: pointsAvailable - cost,
    success: true,
    message: `Restored one Level ${targetLevel} spell slot! (${pointsAvailable - cost} pts remaining)`,
  };
}
