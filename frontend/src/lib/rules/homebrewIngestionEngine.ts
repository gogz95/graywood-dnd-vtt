// homebrewIngestionEngine.ts — Clean GitHub Homebrew Ingestion & Runtime Ruleset Adaptation Pipeline
// Transforms pure, un-opinionated 5e SRD items and monsters into campaign-isolated models
// based on the active CampaignRulesetConfig feature flags (currencies, dialects, durability RP, decay, essence).

import type {
  Raw5eItem,
  Raw5eMonster,
  Adapted5eItem,
  Adapted5eMonster,
  ContrabandLegalTier,
  CurrencyBreakdown,
} from '../types/srdHomebrew';
import type { CampaignRulesetConfig } from '../types/campaign';
import type { CompendiumEntity } from '../importers/compendiumImporter';
import type { PartyStashItem } from '../../stores/sessionStore';

// ── 1. Regional Dialect Matrix ────────────────────────────────────────────────
export const REGIONAL_DIALECT_MAP: Record<string, string> = {
  'Common': 'Old Concord / Vaelic Common',
  'Dwarvish': 'Gilionite Stone-Canto',
  'Elvish': 'Ay-Modlahd High Sylvan',
  'Undercommon': 'Rucean Deep-Patois',
  'Orc': 'Khoric Guttural',
  'Draconic': 'Wyrm-Tongue (Aethelgard)',
  'Goblin': 'Fen-Goblin Skitter',
  'Giant': 'Jotun-Runemarked',
  'Halfling': 'Lowland Concord Patois',
  'Gnomish': 'Tinker-Cipher',
  'Infernal': 'Ashen Script',
  'Abyssal': 'Void Whispers',
  'Celestial': 'Solar Canticle',
  'Primordial': 'Elemental Archaic',
  'Sylvan': 'Feywild Cant',
};

export function translateLanguageToDialect(language: string, enabled: boolean): string {
  if (!enabled) return language;
  const trimmed = language.trim();
  return REGIONAL_DIALECT_MAP[trimmed] || trimmed;
}

export function translateLanguagesForMonster(languages: string[], enabled: boolean): string[] {
  if (!enabled || !Array.isArray(languages)) return languages || [];
  return languages.map(lang => translateLanguageToDialect(lang, true));
}

// ── 2. Currency Re-Indexing & Assay Fee Calculation ───────────────────────────
export function calculateCurrencyBreakdown(costGp: number, config: CampaignRulesetConfig): CurrencyBreakdown {
  const rawGp = Math.max(0, costGp);

  if (!config.features.enableCustomCurrencies) {
    return {
      rawGp,
      sovereignGp: rawGp,
      sunDisks10Gp: 0,
      tradeBars50Gp: 0,
      assayFeeDeductedGp: 0,
      netValueGp: rawGp,
      formattedDisplay: `${rawGp} GP`,
    };
  }

  // 1:1 Standard Concord Sovereign
  const sovereignGp = rawGp;
  const tradeBars50Gp = Math.floor(rawGp / 50);
  const remainingAfterBars = rawGp % 50;
  const sunDisks10Gp = Math.floor(remainingAfterBars / 10);
  const sovereignsRemaining = remainingAfterBars % 10;

  // Foreign Bullion Assay Clipping Fee (10%)
  const assayFeeDeductedGp = config.features.enableCurrencyAssayFee
    ? Math.round(rawGp * 0.10 * 100) / 100
    : 0;
  const netValueGp = Math.max(0, Math.round((rawGp - assayFeeDeductedGp) * 100) / 100);

  // Formatted display
  const parts: string[] = [];
  if (tradeBars50Gp > 0) parts.push(`${tradeBars50Gp} Trade Bar${tradeBars50Gp > 1 ? 's' : ''}`);
  if (sunDisks10Gp > 0) parts.push(`${sunDisks10Gp} Sun Disk${sunDisks10Gp > 1 ? 's' : ''}`);
  if (sovereignsRemaining > 0 || parts.length === 0) {
    parts.push(`${sovereignsRemaining} Sovereign${sovereignsRemaining !== 1 ? 's' : ''}`);
  }

  return {
    rawGp,
    sovereignGp,
    sunDisks10Gp,
    tradeBars50Gp,
    assayFeeDeductedGp,
    netValueGp,
    formattedDisplay: parts.join(', '),
  };
}

// ── 3. Contraband Taxonomy (Legal Tiers I - IV) ────────────────────────────────
export function classifyContrabandTier(item: Raw5eItem, enabled: boolean): { tier: ContrabandLegalTier; notes: string } {
  if (!enabled) {
    return {
      tier: 'Tier I: Unrestricted',
      notes: 'Standard market commerce under general 5e rules.',
    };
  }

  const nameLower = item.name.toLowerCase();
  const descLower = (item.description || '').toLowerCase();
  const combined = `${nameLower} ${descLower}`;

  // Tier IV: Proscribed & Treasonous (Capital crime)
  if (
    combined.includes('black orb') ||
    combined.includes('soul gem') ||
    combined.includes('lich') ||
    combined.includes('phylactery') ||
    combined.includes('void extract') ||
    combined.includes('necrotic curse')
  ) {
    return {
      tier: 'Tier IV: Proscribed & Treasonous',
      notes: 'Possession constitutes capital high treason under the Concord Charter. Subject to immediate confiscation by inquisitors.',
    };
  }

  // Tier III: Restricted Contraband
  if (
    item.type === 'Reagent' && (combined.includes('venom') || combined.includes('poison') || combined.includes('acid')) ||
    combined.includes('black powder') ||
    combined.includes('explosive') ||
    combined.includes('un-assayed') ||
    combined.includes('poison') ||
    item.rarity === 'Very Rare' ||
    item.rarity === 'Legendary'
  ) {
    return {
      tier: 'Tier III: Restricted Contraband',
      notes: 'Restricted sovereign monopoly goods. Requires registered Sovereign Magistrate writ or Portmaster dispensation.',
    };
  }

  // Tier II: Guild Regulated
  if (
    (item.type === 'Weapon' && (
      item.properties?.includes('Heavy') ||
      item.properties?.includes('Reach') ||
      item.properties?.includes('Martial') ||
      item.damage === '2d6' ||
      item.damage === '1d10'
    )) ||
    item.type === 'Armor' && (item.ac && item.ac >= 14) ||
    item.type === 'Potion' ||
    item.rarity === 'Rare' ||
    item.rarity === 'Uncommon' ||
    (item.type === 'Reagent' && item.isPerishable)
  ) {
    return {
      tier: 'Tier II: Guild Regulated',
      notes: 'Regulated martial equipment and specialized alchemical stock. Requires licensed Guild Merchant endorsement.',
    };
  }

  // Tier I: Unrestricted
  return {
    tier: 'Tier I: Unrestricted',
    notes: 'Common adventuring provisions, simple hand implements, and unrestricted civil commerce.',
  };
}

// ── 4. Durability Resistance Points (RP) & Sunder ──────────────────────────────
export interface DurabilityRpResult {
  maxRp?: number;
  currentRp?: number;
  sunderThreshold?: number;
  isBroken: boolean;
  effectivePenalty: number;
  label: string;
}

export function calculateDurabilityRp(
  item: Raw5eItem,
  enabled: boolean
): DurabilityRpResult | undefined {
  if (!enabled || (item.type !== 'Weapon' && item.type !== 'Armor')) {
    return undefined;
  }

  let maxRp = 20;

  if (item.type === 'Weapon') {
    switch (item.rarity) {
      case 'Common': maxRp = 15; break;
      case 'Uncommon': maxRp = 20; break;
      case 'Rare': maxRp = 25; break;
      case 'Very Rare': maxRp = 30; break;
      case 'Legendary': maxRp = 40; break;
      default: maxRp = 15; break;
    }
  } else if (item.type === 'Armor') {
    if (item.properties?.includes('Heavy Armor') || (item.ac && item.ac >= 16)) {
      maxRp = 30;
    } else if (item.properties?.includes('Medium Armor') || (item.ac && item.ac >= 13)) {
      maxRp = 20;
    } else if (item.properties?.includes('Shield') || (item.ac && item.ac <= 2)) {
      maxRp = 15;
    } else {
      maxRp = 15; // Light armor
    }
  }

  const sunderThreshold = Math.floor(maxRp * 0.25);

  return {
    maxRp,
    currentRp: maxRp,
    sunderThreshold,
    isBroken: false,
    effectivePenalty: 0,
    label: 'Pristine (Full Durability)',
  };
}

// ── 5. 24-Hour Organ & Viscera Decay Countdown ─────────────────────────────────
export interface OrganDecayResult {
  decayHoursRemaining?: number;
  harvestTimestamp?: number;
  decayState: 'fresh' | 'spoiled' | 'preserved';
}

export function calculateOrganDecayTimer(
  item: Raw5eItem,
  enabled: boolean
): OrganDecayResult {
  if (!enabled || !item.isPerishable) {
    return {
      decayState: item.isPerishable ? 'fresh' : 'preserved',
    };
  }

  return {
    decayHoursRemaining: 24,
    harvestTimestamp: Math.floor(Date.now() / 1000),
    decayState: 'fresh',
  };
}

export const calculateOrganDecay = calculateOrganDecayTimer;

// ── 6. 28-Essence Alchemy Matrix Keyword Mapping ───────────────────────────────
export function mapElementalEssenceTag(item: Raw5eItem, enabled: boolean): string | undefined {
  if (!enabled || item.type !== 'Reagent') {
    return undefined;
  }

  const text = `${item.name} ${item.description}`.toLowerCase();

  if (text.includes('venom') || text.includes('poison') || text.includes('stinger')) {
    return 'Toxic (Venom)';
  }
  if (text.includes('fire') || text.includes('flame') || text.includes('pyric') || text.includes('thermal') || text.includes('furnace')) {
    return 'Pyretic (Fire)';
  }
  if (text.includes('ice') || text.includes('cold') || text.includes('frost') || text.includes('glacial')) {
    return 'Glacial (Cold)';
  }
  if (text.includes('lightning') || text.includes('voltaic') || text.includes('shock') || text.includes('storm')) {
    return 'Voltaic (Lightning)';
  }
  if (text.includes('acid') || text.includes('bile') || text.includes('corrosive')) {
    return 'Corrosive (Acid)';
  }
  if (text.includes('blood') || text.includes('vital') || text.includes('regenerative')) {
    return 'Vital / Sanguine (Blood)';
  }
  if (text.includes('petrif') || text.includes('mineral') || text.includes('stone') || text.includes('earth')) {
    return 'Telluric (Earth)';
  }
  if (text.includes('chitin') || text.includes('silk') || text.includes('filament') || text.includes('pelt') || text.includes('hide')) {
    return 'Chitinous (Beast)';
  }
  if (text.includes('mandrake') || text.includes('root') || text.includes('botanical') || text.includes('herb') || text.includes('leaf')) {
    return 'Verdant (Flora)';
  }
  if (text.includes('soul') || text.includes('shadow') || text.includes('dark') || text.includes('necrotic')) {
    return 'Umbral (Necrotic)';
  }
  if (text.includes('radiant') || text.includes('solar') || text.includes('luminescent') || text.includes('phosphorescent')) {
    return 'Solar (Radiant)';
  }
  if (text.includes('arcane') || text.includes('force') || text.includes('aether')) {
    return 'Aetheric (Force)';
  }

  return 'Universal Botanical Reagent';
}

export const inferReagentEssenceTag = mapElementalEssenceTag;

// ── 7. Master Runtime Adaptation Functions ────────────────────────────────────

/**
 * Transforms a raw, generic 5e item into an adapted workstation item
 * based on the active campaign configuration.
 */
export function adaptItemForCampaign(item: Raw5eItem, config: CampaignRulesetConfig): Adapted5eItem {
  const isAugmented = config.isHomebrewActive;

  // 1. Currency & Assay
  const currency = calculateCurrencyBreakdown(item.costGp, config);

  // 2. Contraband Tier
  const contraband = classifyContrabandTier(item, config.features.enableContrabandTaxonomy);

  // 3. Durability RP
  const durability = calculateDurabilityRp(item, config.features.enableDurabilityRp);

  // 4. Decay Countdown
  const decay = calculateOrganDecayTimer(item, config.features.enableOrganDecayTimer);

  // 5. Essence Matrix
  const essenceTag = mapElementalEssenceTag(item, config.features.enableElementalEssenceMatrix);

  return {
    ...item,
    adaptedRulesetId: config.id,
    isHomebrewAugmented: isAugmented,
    contrabandTier: config.features.enableContrabandTaxonomy ? contraband.tier : undefined,
    contrabandNotes: config.features.enableContrabandTaxonomy ? contraband.notes : undefined,
    currency,
    currentRp: durability?.currentRp,
    maxRp: durability?.maxRp,
    sunderThreshold: durability?.sunderThreshold,
    isBroken: durability?.isBroken ?? false,
    effectivePenalty: durability?.effectivePenalty ?? 0,
    durabilityLabel: durability?.label,
    decayHoursRemaining: decay.decayHoursRemaining,
    harvestTimestamp: decay.harvestTimestamp,
    decayState: decay.decayState,
    essenceTag,
  };
}

/**
 * Transforms a raw, generic 5e monster into an adapted workstation monster
 * with dialect translation and harvest appraisal hooks.
 */
export function adaptMonsterForCampaign(monster: Raw5eMonster, config: CampaignRulesetConfig): Adapted5eMonster {
  const isAugmented = config.isHomebrewActive;

  const regionalLanguages = translateLanguagesForMonster(
    monster.languages || [],
    config.features.enableRegionalDialects
  );

  let harvestPotential = undefined;
  if (config.features.enableOrganDecayTimer || config.features.enableElementalEssenceMatrix) {
    const baseDc = Math.max(8, Math.min(25, 10 + Math.floor(monster.cr / 2)));
    harvestPotential = {
      harvestDc: baseDc,
      favoredSkill: monster.type.toLowerCase().includes('dragon') || monster.type.toLowerCase().includes('monstrosity') ? 'Arcana' : 'Nature',
      essenceHint: monster.type.toLowerCase().includes('fiend') ? 'Pyretic' : monster.type.toLowerCase().includes('undead') ? 'Umbral' : 'Biological Reagents',
    };
  }

  return {
    ...monster,
    adaptedRulesetId: config.id,
    isHomebrewAugmented: isAugmented,
    regionalLanguages,
    harvestPotential,
  };
}

/**
 * Ingests a raw homebrew dataset, applying runtime adaptation based on active campaign rules.
 */
export function ingestHomebrewDataset(
  dataset: { items?: Raw5eItem[]; monsters?: Raw5eMonster[] },
  config: CampaignRulesetConfig
): {
  items: Adapted5eItem[];
  monsters: Adapted5eMonster[];
  summary: {
    totalItems: number;
    totalMonsters: number;
    rulesetName: string;
    isHomebrewActive: boolean;
  };
} {
  const items = (dataset.items || []).map(i => adaptItemForCampaign(i, config));
  const monsters = (dataset.monsters || []).map(m => adaptMonsterForCampaign(m, config));

  return {
    items,
    monsters,
    summary: {
      totalItems: items.length,
      totalMonsters: monsters.length,
      rulesetName: config.name,
      isHomebrewActive: config.isHomebrewActive,
    },
  };
}

/**
 * Converts an adapted item or monster into standard CompendiumEntity format.
 */
export function convertAdaptedToCompendiumEntity(adapted: Adapted5eItem | Adapted5eMonster): CompendiumEntity {
  if ('size' in adapted) {
    // Monster
    return {
      id: adapted.id,
      name: adapted.name,
      type: 'creature',
      size: adapted.size,
      creatureType: adapted.type,
      cr: adapted.cr,
      hp: adapted.hp,
      ac: adapted.ac,
      source: 'imported',
      description: `CR ${adapted.cr} ${adapted.size} ${adapted.type}. Languages: ${adapted.regionalLanguages.join(', ') || 'None'}.`,
      traits: adapted.traits,
      actions: adapted.actions,
    };
  }

  // Item
  const parts: string[] = [adapted.description];
  if (adapted.contrabandTier) parts.push(`[${adapted.contrabandTier}]`);
  if (adapted.maxRp) parts.push(`[Durability: ${adapted.currentRp}/${adapted.maxRp} RP]`);
  if (adapted.essenceTag) parts.push(`[Essence: ${adapted.essenceTag}]`);
  if (adapted.decayHoursRemaining) parts.push(`[Decay: ${adapted.decayHoursRemaining}h]`);
  if (adapted.currency?.assayFeeDeductedGp) {
    parts.push(`[Assay Fee: 10% (-${adapted.currency.assayFeeDeductedGp} GP)]`);
  }

  return {
    id: adapted.id,
    name: adapted.name,
    type: 'item',
    category: adapted.type,
    rarity: adapted.rarity,
    cost: adapted.currency ? adapted.currency.formattedDisplay : `${adapted.costGp} gp`,
    weight: adapted.weightLbs,
    description: parts.join(' '),
    source: 'imported',
  };
}

/**
 * Converts an adapted item into PartyStashItem format for direct party inventory deposit.
 */
export function convertAdaptedToPartyStashItem(adapted: Adapted5eItem): PartyStashItem {
  return {
    id: `stash-${adapted.id}-${Date.now().toString(36)}`,
    name: adapted.name,
    category: adapted.type,
    quantity: 1,
    weight: adapted.weightLbs,
    description: adapted.description,
    valueGp: adapted.currency ? adapted.currency.netValueGp : adapted.costGp,
    isPreserved: adapted.decayState === 'preserved' || !adapted.isPerishable,
    isSpoiled: adapted.decayState === 'spoiled',
    essence: adapted.essenceTag,
    harvestedAtHour: adapted.harvestTimestamp ? Math.floor(adapted.harvestTimestamp / 3600) : undefined,
  };
}
