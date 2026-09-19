// srdHomebrew.ts — Standard Un-Opinionated 5e Schemas & Adapted Runtime Interfaces
// Keeps source homebrew 100% vanilla and RAW compliant, while supporting dynamic runtime transformation.

export type RawItemType = 'Weapon' | 'Armor' | 'Gear' | 'Reagent' | 'Potion';

export type RawItemRarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Very Rare'
  | 'Legendary';

export type RawCreatureSize =
  | 'Tiny'
  | 'Small'
  | 'Medium'
  | 'Large'
  | 'Huge'
  | 'Gargantuan';

/**
 * Clean, generic 5e/SRD standard item contract.
 * Free of setting-specific lore, custom currency denominations, or house-rule durability.
 */
export interface Raw5eItem {
  id: string;
  name: string;
  type: RawItemType;
  costGp: number;
  weightLbs: number;
  rarity: RawItemRarity;
  description: string;
  properties?: string[];
  damage?: string;
  damageType?: string;
  ac?: number;
  isPerishable?: boolean;
}

/**
 * Clean, generic 5e/SRD standard creature/monster contract.
 */
export interface Raw5eMonster {
  id: string;
  name: string;
  size: RawCreatureSize;
  type: string;
  cr: number;
  hp: number;
  ac: number;
  languages: string[];
  traits?: Array<{ name: string; desc: string }>;
  actions?: Array<{ name: string; desc: string }>;
}

export type ContrabandLegalTier =
  | 'Tier I: Unrestricted'
  | 'Tier II: Guild Regulated'
  | 'Tier III: Restricted Contraband'
  | 'Tier IV: Proscribed & Treasonous';

export interface CurrencyBreakdown {
  rawGp: number;
  sovereignGp: number;
  sunDisks10Gp: number;
  tradeBars50Gp: number;
  assayFeeDeductedGp: number;
  netValueGp: number;
  formattedDisplay: string;
}

/**
 * Runtime adapted 5e item augmented by active campaign ruleset features.
 */
export interface Adapted5eItem extends Raw5eItem {
  adaptedRulesetId: string;
  isHomebrewAugmented: boolean;

  // Contraband Taxonomy
  contrabandTier?: ContrabandLegalTier;
  contrabandNotes?: string;

  // Re-indexed Currencies & Foreign Bullion Assay Fees
  currency?: CurrencyBreakdown;

  // Equipment Durability Resistance Points (RP) & Sunder
  currentRp?: number;
  maxRp?: number;
  sunderThreshold?: number;
  isBroken?: boolean;
  effectivePenalty?: number;
  durabilityLabel?: string;

  // 24-Hour Organ & Viscera Decay Countdown
  decayHoursRemaining?: number;
  harvestTimestamp?: number;
  decayState?: 'fresh' | 'spoiled' | 'preserved';

  // 28-Essence Alchemy Matrix
  essenceTag?: string;
}

/**
 * Runtime adapted 5e monster with regional dialect translations and setting hooks.
 */
export interface Adapted5eMonster extends Raw5eMonster {
  adaptedRulesetId: string;
  isHomebrewAugmented: boolean;
  regionalLanguages: string[];
  harvestPotential?: {
    harvestDc: number;
    favoredSkill: string;
    essenceHint?: string;
  };
}
