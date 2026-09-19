// sunderEngine.ts — Aleamos Equipment Durability, Sunder & Artisan Repair Engine
// Natural 1s sunder weapons (-1 RP); incoming critical hits sunder armor (-1 RP).
// At 0 RP, weapons suffer -1 attack/damage; armor suffers -1 AC.
// Field repair: 1-hour Short Rest, tool check (DC 8 + missing RP), 1 raw material unit restores 5 RP.

export interface DurableEquipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor';
  currentRp: number;
  maxRp: number;
  material?: 'iron' | 'steel' | 'leather' | 'wood' | 'mithral' | 'adamantine';
  toolRequired?: 'Smith' | 'Leatherworker';
  attackBonus?: number;
  damageFormula?: string;
  acBonus?: number;
}

export interface SunderEventResult {
  updatedItem: DurableEquipment;
  rpLost: number;
  isBroken: boolean;
  effectivePenalty: number;
  message: string;
}

export interface ArtisanRepairResult {
  success: boolean;
  targetDc: number;
  checkRoll: number;
  rpRestored: number;
  materialsConsumed: number;
  hoursRequired: number;
  updatedItem: DurableEquipment;
  message: string;
}

/**
 * Calculates attack, damage, or AC penalties based on current Resistance Points.
 * Rule: At 0 RP, weapons suffer -1 penalty to attack and damage rolls; armor suffers -1 to AC.
 */
export function calculateEquipmentPenalty(item: DurableEquipment): {
  attackPenalty: number;
  damagePenalty: number;
  acPenalty: number;
  isBroken: boolean;
  statusLabel: string;
} {
  const isBroken = item.currentRp <= 0;
  if (!isBroken) {
    return {
      attackPenalty: 0,
      damagePenalty: 0,
      acPenalty: 0,
      isBroken: false,
      statusLabel: item.currentRp < item.maxRp ? 'Battered' : 'Pristine',
    };
  }

  // Broken/Sundered: 0 RP
  return {
    attackPenalty: item.type === 'weapon' ? -1 : 0,
    damagePenalty: item.type === 'weapon' ? -1 : 0,
    acPenalty: item.type === 'armor' ? -1 : 0,
    isBroken: true,
    statusLabel: 'Sundered (-1 Penalty)',
  };
}

/**
 * Evaluates weapon durability on attack rolls.
 * Rule: Rolling a natural 1 on an attack decrements weapon RP by 1.
 */
export function evaluateWeaponAttackRoll(
  weapon: DurableEquipment,
  d20Roll: number
): SunderEventResult {
  if (d20Roll !== 1) {
    const { isBroken, attackPenalty } = calculateEquipmentPenalty(weapon);
    return {
      updatedItem: weapon,
      rpLost: 0,
      isBroken,
      effectivePenalty: attackPenalty,
      message: 'Attack completed without weapon wear.',
    };
  }

  // Natural 1 triggered!
  const newRp = Math.max(0, weapon.currentRp - 1);
  const updated: DurableEquipment = { ...weapon, currentRp: newRp };
  const { isBroken, attackPenalty } = calculateEquipmentPenalty(updated);

  let msg = `Natural 1! ${weapon.name} took weapon strain (-1 RP, now ${newRp}/${weapon.maxRp}).`;
  if (newRp === 0) {
    msg += ` WARNING: ${weapon.name} has SUNDERED! Suffers -1 penalty to attack and damage rolls until repaired.`;
  }

  return {
    updatedItem: updated,
    rpLost: 1,
    isBroken,
    effectivePenalty: attackPenalty,
    message: msg,
  };
}

/**
 * Evaluates armor durability when hit in combat.
 * Rule: Taking an incoming critical hit decrements armor RP by 1.
 */
export function evaluateIncomingArmorHit(
  armor: DurableEquipment,
  isIncomingCrit: boolean
): SunderEventResult {
  if (!isIncomingCrit) {
    const { isBroken, acPenalty } = calculateEquipmentPenalty(armor);
    return {
      updatedItem: armor,
      rpLost: 0,
      isBroken,
      effectivePenalty: acPenalty,
      message: 'Blow absorbed without structural armor damage.',
    };
  }

  // Critical hit sustained!
  const newRp = Math.max(0, armor.currentRp - 1);
  const updated: DurableEquipment = { ...armor, currentRp: newRp };
  const { isBroken, acPenalty } = calculateEquipmentPenalty(updated);

  let msg = `Incoming Critical Hit! ${armor.name} plate buckled (-1 RP, now ${newRp}/${armor.maxRp}).`;
  if (newRp === 0) {
    msg += ` WARNING: ${armor.name} has SUNDERED! Suffers -1 AC penalty until repaired.`;
  }

  return {
    updatedItem: updated,
    rpLost: 1,
    isBroken,
    effectivePenalty: acPenalty,
    message: msg,
  };
}

/**
 * Performs artisan field maintenance during a Short Rest.
 * Rule: Restoring 5 depleted RP requires 1 hour of Short Rest maintenance with
 * Smith's or Leatherworker's Tools, 1 unit of raw iron/leather, and a tool check of DC 8 + missing RP.
 */
export function performArtisanFieldMaintenance(
  item: DurableEquipment,
  toolCheckRoll: number,
  hasTools = true,
  materialsAvailable = 1
): ArtisanRepairResult {
  const missingRp = Math.max(0, item.maxRp - item.currentRp);

  if (missingRp === 0) {
    return {
      success: true,
      targetDc: 8,
      checkRoll: toolCheckRoll,
      rpRestored: 0,
      materialsConsumed: 0,
      hoursRequired: 0,
      updatedItem: item,
      message: `${item.name} is already at full structural durability (${item.maxRp}/${item.maxRp} RP).`,
    };
  }

  if (!hasTools) {
    return {
      success: false,
      targetDc: 8 + missingRp,
      checkRoll: toolCheckRoll,
      rpRestored: 0,
      materialsConsumed: 0,
      hoursRequired: 1,
      updatedItem: item,
      message: `Field maintenance aborted: Appropriate artisan tools (${item.toolRequired || 'Smith or Leatherworker'}) missing.`,
    };
  }

  if (materialsAvailable < 1) {
    return {
      success: false,
      targetDc: 8 + missingRp,
      checkRoll: toolCheckRoll,
      rpRestored: 0,
      materialsConsumed: 0,
      hoursRequired: 1,
      updatedItem: item,
      message: 'Field maintenance aborted: Requires at least 1 unit of raw material (iron, steel, or treated leather).',
    };
  }

  const targetDc = 8 + missingRp;
  const passed = toolCheckRoll >= targetDc;

  if (passed) {
    const rpRestored = Math.min(5, missingRp);
    const newRp = item.currentRp + rpRestored;
    const updated: DurableEquipment = { ...item, currentRp: newRp };

    return {
      success: true,
      targetDc,
      checkRoll: toolCheckRoll,
      rpRestored,
      materialsConsumed: 1,
      hoursRequired: 1,
      updatedItem: updated,
      message: `Artisan check ${toolCheckRoll} vs DC ${targetDc} SUCCEEDED! Restored ${rpRestored} RP on ${item.name} (${newRp}/${item.maxRp} RP).`,
    };
  } else {
    return {
      success: false,
      targetDc,
      checkRoll: toolCheckRoll,
      rpRestored: 0,
      materialsConsumed: 1, // Raw material spoiled during failed tempering
      hoursRequired: 1,
      updatedItem: item,
      message: `Artisan check ${toolCheckRoll} vs DC ${targetDc} FAILED! Quenching cracked the patch. 1 unit of raw material lost.`,
    };
  }
}
