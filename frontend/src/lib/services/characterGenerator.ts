// src/lib/services/characterGenerator.ts
// 5e SRD Character Generation Engine: Ability constraints, subclass milestones, and pristine starting equipment

export const POINT_BUY_TOTAL_POINTS = 27;

export const POINT_BUY_COST_TABLE: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9
};

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const SUBCLASS_LEVEL_MILESTONES: Record<string, number> = {
  Cleric: 1,
  Sorcerer: 1,
  Warlock: 1,
  Wizard: 2,
  Druid: 2,
  Barbarian: 3,
  Bard: 3,
  Fighter: 3,
  Monk: 3,
  Paladin: 3,
  Ranger: 3,
  Rogue: 3
};

export interface StartingItem {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'gear';
  currentRp: number;
  maxRp: number;
  isBroken: boolean;
  sunderPenalty: number;
  acBonus?: number;
  attackBonus?: number;
  damageFormula?: string;
  damageType?: string;
  description: string;
}

/**
 * Calculates point-buy cost for a single ability score (8-15).
 */
export function getPointBuyCost(score: number): number {
  const clamped = Math.max(8, Math.min(15, Math.floor(score)));
  return POINT_BUY_COST_TABLE[clamped] ?? 0;
}

/**
 * Validates Point Buy allocation across all 6 stats.
 */
export function validatePointBuy(scores: Record<string, number>): {
  valid: boolean;
  spent: number;
  remaining: number;
  error?: string;
} {
  const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  let spent = 0;

  for (const k of keys) {
    const val = scores[k];
    if (typeof val !== 'number' || isNaN(val)) {
      return { valid: false, spent: 0, remaining: 0, error: `Invalid ${k.toUpperCase()} score.` };
    }
    if (val < 8 || val > 15) {
      return {
        valid: false,
        spent,
        remaining: POINT_BUY_TOTAL_POINTS - spent,
        error: `${k.toUpperCase()} (${val}) must be between 8 and 15 in Point Buy.`
      };
    }
    spent += getPointBuyCost(val);
  }

  const remaining = POINT_BUY_TOTAL_POINTS - spent;
  if (remaining < 0) {
    return {
      valid: false,
      spent,
      remaining,
      error: `Point Buy exceeded: ${spent} / ${POINT_BUY_TOTAL_POINTS} points spent.`
    };
  }

  return { valid: true, spent, remaining };
}

/**
 * Validates Standard Array assignment.
 */
export function validateStandardArray(scores: Record<string, number>): {
  valid: boolean;
  error?: string;
} {
  const vals = ['str', 'dex', 'con', 'int', 'wis', 'cha']
    .map(k => scores[k])
    .sort((a, b) => b - a);

  const expected = [...STANDARD_ARRAY].sort((a, b) => b - a);

  for (let i = 0; i < expected.length; i++) {
    if (vals[i] !== expected[i]) {
      return {
        valid: false,
        error: `Standard Array requires exactly the scores [15, 14, 13, 12, 10, 8]. Received: [${vals.join(', ')}].`
      };
    }
  }

  return { valid: true };
}

/**
 * Validates Rolled Stats (4d6 drop lowest).
 */
export function validateRolledStats(scores: Record<string, number>): {
  valid: boolean;
  error?: string;
} {
  for (const [stat, val] of Object.entries(scores)) {
    if (typeof val !== 'number' || isNaN(val) || val < 3 || val > 18) {
      return {
        valid: false,
        error: `${stat.toUpperCase()} (${val}) is outside the rolled 4d6 bounds (3 to 18).`
      };
    }
  }
  return { valid: true };
}

/**
 * Clamps level 1 pre-ASI ability score to 5e hard cap of 20.
 */
export function clampLevel1Score(score: number): number {
  return Math.min(20, Math.max(1, Math.floor(score)));
}

/**
 * Returns the subclass title only if the character level meets or exceeds the official milestone.
 */
export function getSubclassForLevel(
  className: string,
  subclassName: string,
  level: number
): string | undefined {
  const milestone = SUBCLASS_LEVEL_MILESTONES[className] ?? 3;
  return level >= milestone && subclassName.trim() ? subclassName.trim() : undefined;
}

/**
 * Generates pristine starting equipment for 5e classes (100% full durability, zero broken status).
 */
export function generateStartingEquipment(className: string): StartingItem[] {
  const base = className.toLowerCase();

  if (base.includes('fighter') || base.includes('paladin')) {
    return [
      {
        id: 'eq-longsword',
        name: 'Steel Longsword',
        type: 'weapon',
        currentRp: 20,
        maxRp: 20,
        isBroken: false,
        sunderPenalty: 0,
        attackBonus: 5,
        damageFormula: '1d8+3',
        damageType: 'slashing',
        description: 'Versatile martial blade in pristine battle-ready polish.'
      },
      {
        id: 'eq-chainmail',
        name: 'Chain Mail Armor',
        type: 'armor',
        currentRp: 25,
        maxRp: 25,
        isBroken: false,
        sunderPenalty: 0,
        acBonus: 6,
        description: 'Interlocking steel rings. Pristine, fully functional 5e heavy armor.'
      },
      {
        id: 'eq-shield',
        name: 'Heavy Iron Shield',
        type: 'armor',
        currentRp: 15,
        maxRp: 15,
        isBroken: false,
        sunderPenalty: 0,
        acBonus: 2,
        description: 'Reinforced wood and iron shield (+2 AC).'
      }
    ];
  }

  if (base.includes('wizard') || base.includes('sorcerer')) {
    return [
      {
        id: 'eq-staff',
        name: 'Arcane Focus Staff',
        type: 'weapon',
        currentRp: 15,
        maxRp: 15,
        isBroken: false,
        sunderPenalty: 0,
        attackBonus: 4,
        damageFormula: '1d6+1',
        damageType: 'bludgeoning',
        description: 'Carved yew focus staff attuned to weave resonance.'
      },
      {
        id: 'eq-robes',
        name: 'Scholar Robes',
        type: 'armor',
        currentRp: 10,
        maxRp: 10,
        isBroken: false,
        sunderPenalty: 0,
        acBonus: 0,
        description: 'Supple woven linen robes in pristine condition.'
      },
      {
        id: 'eq-dagger',
        name: 'Silver Dagger',
        type: 'weapon',
        currentRp: 10,
        maxRp: 10,
        isBroken: false,
        sunderPenalty: 0,
        attackBonus: 5,
        damageFormula: '1d4+3',
        damageType: 'piercing',
        description: 'Emergency silvered thrusting blade.'
      }
    ];
  }

  if (base.includes('barbarian')) {
    return [
      {
        id: 'eq-greataxe',
        name: 'Greataxe of the Reaver',
        type: 'weapon',
        currentRp: 25,
        maxRp: 25,
        isBroken: false,
        sunderPenalty: 0,
        attackBonus: 5,
        damageFormula: '1d12+3',
        damageType: 'slashing',
        description: 'Heavy two-handed greataxe with razor-honed double bevel.'
      },
      {
        id: 'eq-handaxe',
        name: 'Throwing Handaxe',
        type: 'weapon',
        currentRp: 12,
        maxRp: 12,
        isBroken: false,
        sunderPenalty: 0,
        attackBonus: 5,
        damageFormula: '1d6+3',
        damageType: 'slashing',
        description: 'Balanced steel throwing handaxe.'
      }
    ];
  }

  if (base.includes('cleric')) {
    return [
      {
        id: 'eq-warhammer',
        name: 'Blessed Warhammer',
        type: 'weapon',
        currentRp: 20,
        maxRp: 20,
        isBroken: false,
        sunderPenalty: 0,
        attackBonus: 5,
        damageFormula: '1d8+2',
        damageType: 'bludgeoning',
        description: 'Engraved with sacred divine iconography.'
      },
      {
        id: 'eq-scalemail',
        name: 'Scale Mail',
        type: 'armor',
        currentRp: 20,
        maxRp: 20,
        isBroken: false,
        sunderPenalty: 0,
        acBonus: 4,
        description: 'Overlapping brass scales in pristine condition.'
      },
      {
        id: 'eq-shield',
        name: 'Holy Relic Shield',
        type: 'armor',
        currentRp: 15,
        maxRp: 15,
        isBroken: false,
        sunderPenalty: 0,
        acBonus: 2,
        description: 'Blessed shield inscribed with deity crest.'
      }
    ];
  }

  // Default / Rogue / Ranger / Bard / Monk
  return [
    {
      id: 'eq-rapier',
      name: 'Shadowforged Rapier',
      type: 'weapon',
      currentRp: 20,
      maxRp: 20,
      isBroken: false,
      sunderPenalty: 0,
      attackBonus: 5,
      damageFormula: '1d8+3',
      damageType: 'piercing',
      description: 'Finesse thrusting blade in pristine balance.'
    },
    {
      id: 'eq-leather',
      name: 'Studded Leather Armor',
      type: 'armor',
      currentRp: 25,
      maxRp: 25,
      isBroken: false,
      sunderPenalty: 0,
      acBonus: 2,
      description: 'Supple boiled leather reinforced with iron rivets.'
    },
    {
      id: 'eq-shortbow',
      name: 'Recurve Shortbow',
      type: 'weapon',
      currentRp: 15,
      maxRp: 15,
      isBroken: false,
      sunderPenalty: 0,
      attackBonus: 5,
      damageFormula: '1d6+3',
      damageType: 'piercing',
      description: 'Well-strung yew shortbow.'
    }
  ];
}
