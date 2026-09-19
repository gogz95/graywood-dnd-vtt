// valuationEngine.ts — Algorithmic Valuation & Procedural Trade Manifest Engine
// Replaces static 5e DMG price tables with Sane Magical Prices utility curves and generates commercial trade manifests.

import { inventoryStore } from '../../stores/characterStore';
import type { InventoryItem } from '../../types/character';
import { dispatchSoundEvent } from '../audio/soundboardBridge';

export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'VERY_RARE' | 'LEGENDARY' | 'ARTIFACT';

export type ManifestCategory = 'CARAVAN' | 'SHIP_CARGO' | 'CONTRABAND';

export type ManifestValueTier = 'MODEST' | 'WEALTHY' | 'ARISTOCRATIC';

export type UtilityFeature =
  | 'FLIGHT'
  | 'TELEPORTATION'
  | 'DAMAGE_RESISTANCE'
  | 'EXTRA_ACTION'
  | 'HEALING'
  | 'SENSES';

export interface SaneValuationParams {
  name?: string;
  rarity: ItemRarity;
  spellLevelEquivalent?: number; // 0 (cantrip) to 9
  isConsumable?: boolean;        // Potions, scrolls, ammunition: 50% discount
  requiresAttunement?: boolean;  // Permanent attunement power premium (+35%)
  combatBonusScalar?: number;    // +1, +2, +3 weapon/armor/spell DC scalars
  utilityFeatures?: UtilityFeature[];
  customModifierGp?: number;
}

export interface ValuationBreakdown {
  basePriceGp: number;
  spellCurveGp: number;
  combatScalarMultiplier: number;
  attunementMultiplier: number;
  consumableDiscountMultiplier: number;
  utilityAddersGp: number;
  finalPriceGp: number;
  priceExplanation: string;
}

export interface ManifestCargoItem {
  id: string;
  name: string;
  category: string;
  crateCount: number;
  weightLbsPerCrate: number;
  totalWeightLbs: number;
  unitPriceGp: number;
  totalCustomsGp: number;
  hazardRating?: 'SAFE' | 'PERISHABLE' | 'VOLATILE' | 'ILLICIT';
  notes: string;
}

export interface TradeManifest {
  id: string;
  manifestCode: string;
  title: string;
  category: ManifestCategory;
  valueTier: ManifestValueTier;
  origin: string;
  destination: string;
  carrier: string;
  createdTimestamp: number;
  totalCrates: number;
  totalWeightLbs: number;
  totalCustomsValueGp: number;
  items: ManifestCargoItem[];
}

// ── 1. SANE MAGICAL PRICES UTILITY CURVE CALCULATOR ──────────────────────────

const RARITY_BASELINES: Record<ItemRarity, number> = {
  COMMON: 50,
  UNCOMMON: 300,
  RARE: 2500,
  VERY_RARE: 15000,
  LEGENDARY: 65000,
  ARTIFACT: 200000,
};

const UTILITY_FEATURE_ADDERS: Record<UtilityFeature, number> = {
  FLIGHT: 2000,
  TELEPORTATION: 3500,
  DAMAGE_RESISTANCE: 1500,
  EXTRA_ACTION: 4500,
  HEALING: 350,
  SENSES: 600,
};

/**
 * Calculates algorithmic item valuation using utility curves, consumable discounts,
 * attunement power premiums, and combat bonus multipliers.
 */
export function calculateSanePrice(params: SaneValuationParams): ValuationBreakdown {
  const baseRarityGp = RARITY_BASELINES[params.rarity] || 50;

  // Spell level utility curve: exponential growth based on spell tier
  let spellCurveGp = 0;
  if (typeof params.spellLevelEquivalent === 'number') {
    const lvl = Math.max(0, Math.min(9, params.spellLevelEquivalent));
    if (lvl === 0) {
      spellCurveGp = 30; // Cantrip utility baseline
    } else {
      // Exponential curve: C(L) = 45 * L^2.25 + 40 * L
      spellCurveGp = Math.round(45 * Math.pow(lvl, 2.25) + 40 * lvl);
    }
  }

  // Combat bonus scalar (+1 -> 1.5x, +2 -> 3.2x, +3 -> 7.5x)
  let combatScalarMultiplier = 1.0;
  if (params.combatBonusScalar && params.combatBonusScalar > 0) {
    if (params.combatBonusScalar === 1) combatScalarMultiplier = 1.5;
    else if (params.combatBonusScalar === 2) combatScalarMultiplier = 3.2;
    else if (params.combatBonusScalar >= 3) combatScalarMultiplier = 7.5;
  }

  // Attunement premium: Concentrated power tax (+35%)
  const attunementMultiplier = params.requiresAttunement ? 1.35 : 1.0;

  // Consumable discount: 50% discount for single-use items
  const consumableDiscountMultiplier = params.isConsumable ? 0.5 : 1.0;

  // Utility feature adders (Flight, Teleportation, etc.)
  let rawUtilityAddersGp = 0;
  if (params.utilityFeatures && params.utilityFeatures.length > 0) {
    for (const f of params.utilityFeatures) {
      rawUtilityAddersGp += UTILITY_FEATURE_ADDERS[f] || 0;
    }
  }

  // Consumable items get single-dose utility weighting (15% of permanent enchantment)
  const utilityAddersGp = params.isConsumable ? Math.round(rawUtilityAddersGp * 0.15) : rawUtilityAddersGp;

  // Core formula:
  // For permanent items, base reflects permanent enchantment (spellCurve * 2).
  // For consumables, base reflects single-use reagent cost.
  const coreBase = params.isConsumable
    ? Math.max(baseRarityGp, spellCurveGp) + utilityAddersGp
    : Math.max(baseRarityGp, spellCurveGp * 2) + utilityAddersGp;

  let finalPrice = coreBase * combatScalarMultiplier * attunementMultiplier * consumableDiscountMultiplier;

  if (params.customModifierGp) {
    finalPrice += params.customModifierGp;
  }

  const finalPriceGp = Math.max(5, Math.round(finalPrice));

  // Build human-readable breakdown text
  const parts: string[] = [
    `Rarity baseline: ${baseRarityGp} GP (${params.rarity})`,
  ];
  if (spellCurveGp > 0) {
    parts.push(`Spell utility curve: +${spellCurveGp} GP (Level ${params.spellLevelEquivalent})`);
  }
  if (combatScalarMultiplier > 1.0) {
    parts.push(`Combat scalar: ×${combatScalarMultiplier} (+${params.combatBonusScalar} weapon/armor/DC)`);
  }
  if (attunementMultiplier > 1.0) {
    parts.push(`Attunement slot premium: +35% (Concentrated power)`);
  }
  if (consumableDiscountMultiplier < 1.0) {
    parts.push(`Consumable discount: -50% (Single use)`);
  }
  if (utilityAddersGp > 0) {
    parts.push(`Utility features: +${utilityAddersGp} GP (${params.utilityFeatures?.join(', ')})`);
  }

  return {
    basePriceGp: baseRarityGp,
    spellCurveGp,
    combatScalarMultiplier,
    attunementMultiplier,
    consumableDiscountMultiplier,
    utilityAddersGp,
    finalPriceGp,
    priceExplanation: parts.join(' · '),
  };
}

// ── 2. PROCEDURAL TRADE MANIFEST GENERATOR ───────────────────────────────────

interface RawCargoBlueprint {
  name: string;
  category: string;
  weightRangeLbs: [number, number];
  unitPriceRangeGp: [number, number];
  hazardRating?: 'SAFE' | 'PERISHABLE' | 'VOLATILE' | 'ILLICIT';
  notes: string;
}

const CARGO_CATALOG: Record<ManifestCategory, RawCargoBlueprint[]> = {
  CARAVAN: [
    { name: 'Baltic Salt Blocks', category: 'Provisions', weightRangeLbs: [40, 60], unitPriceRangeGp: [3, 8], hazardRating: 'SAFE', notes: 'Food preservation grade sea salt in wooden casks.' },
    { name: 'Northern Flax & Linen Bales', category: 'Textiles', weightRangeLbs: [50, 75], unitPriceRangeGp: [12, 25], hazardRating: 'SAFE', notes: 'High-thread count unbleached linen for sailcloth and garmentry.' },
    { name: 'Refined Bog Iron Ingots', category: 'Metals', weightRangeLbs: [80, 120], unitPriceRangeGp: [20, 45], hazardRating: 'SAFE', notes: 'Smelted pig iron stamped by the regional armorer guild.' },
    { name: 'Sun-Dried Mandrake Root', category: 'Apothecary', weightRangeLbs: [15, 25], unitPriceRangeGp: [40, 85], hazardRating: 'PERISHABLE', notes: 'Alchemical reagent used in restorative tinctures.' },
    { name: 'Cured Mountain Goat Cheeses', category: 'Provisions', weightRangeLbs: [30, 45], unitPriceRangeGp: [5, 12], hazardRating: 'PERISHABLE', notes: 'Wax-sealed wheels resistant to overland spoiling.' },
    { name: 'Hillsmith Timber Pitch', category: 'Naval Stores', weightRangeLbs: [60, 90], unitPriceRangeGp: [8, 18], hazardRating: 'VOLATILE', notes: 'Flammable pine resin barrels used for waterproofing wagons.' },
    { name: 'Cast Bronze Trade Bells', category: 'Crafted Wares', weightRangeLbs: [35, 55], unitPriceRangeGp: [25, 60], hazardRating: 'SAFE', notes: 'Tuned sanctified bells destined for highland chapel belfries.' },
  ],
  SHIP_CARGO: [
    { name: 'Spiced Southern Clove Crates', category: 'Spices', weightRangeLbs: [25, 40], unitPriceRangeGp: [60, 140], hazardRating: 'PERISHABLE', notes: 'Fragrant dried flower buds prized by noble banquets.' },
    { name: 'Dwarven Deep-Silver Billets', category: 'Precious Metals', weightRangeLbs: [60, 90], unitPriceRangeGp: [150, 320], hazardRating: 'SAFE', notes: 'High-purity silver bars bearing clan smelter mintmarks.' },
    { name: 'Aged Cask Wine (Vintage Port)', category: 'Luxury Drink', weightRangeLbs: [80, 110], unitPriceRangeGp: [45, 95], hazardRating: 'SAFE', notes: 'Fortified red wine aged in charred oak hogsheads.' },
    { name: 'Raw Obsidian Blocks', category: 'Minerals', weightRangeLbs: [70, 100], unitPriceRangeGp: [35, 75], hazardRating: 'SAFE', notes: 'Volcanic glass slabs intended for scrying mirrors and scalpels.' },
    { name: 'Treated Wyrm-Scale Cordage', category: 'Naval Stores', weightRangeLbs: [45, 70], unitPriceRangeGp: [80, 180], hazardRating: 'SAFE', notes: 'High-tensile rigging rope woven with sea-drake fibers.' },
    { name: 'Ambergris Resin Pots', category: 'Perfume / Alchemy', weightRangeLbs: [10, 20], unitPriceRangeGp: [250, 600], hazardRating: 'SAFE', notes: 'Rare aromatic sea harvest used in royal scents and potion stabilizers.' },
    { name: 'Hardwood Ship Keel Beams', category: 'Timber', weightRangeLbs: [180, 250], unitPriceRangeGp: [30, 70], hazardRating: 'SAFE', notes: 'Cured ironwood timbers for drydock repair.' },
  ],
  CONTRABAND: [
    { name: 'Grave-Soil Lichmoss', category: 'Black Market Reagents', weightRangeLbs: [10, 20], unitPriceRangeGp: [180, 450], hazardRating: 'ILLICIT', notes: 'Banned necromantic catalyst harvested from desecrated barrows.' },
    { name: 'Smuggled Imperial Sovereign Dies', category: 'Counterfeiting Tools', weightRangeLbs: [15, 25], unitPriceRangeGp: [350, 800], hazardRating: 'ILLICIT', notes: 'Stolen steel coin-stamping master dies from the royal mint.' },
    { name: 'Alchemical Blasting Powder', category: 'Explosives', weightRangeLbs: [30, 50], unitPriceRangeGp: [120, 280], hazardRating: 'VOLATILE', notes: 'Highly unstable sulfurous powder restricted by imperial decree.' },
    { name: 'Dream-Lotus Opium Paste', category: 'Narcotics', weightRangeLbs: [12, 22], unitPriceRangeGp: [200, 500], hazardRating: 'ILLICIT', notes: 'Euphoric narcotic bricks sealed in lead foil to evade hound scents.' },
    { name: 'Unbound Void Glass Shards', category: 'Planar Curios', weightRangeLbs: [8, 15], unitPriceRangeGp: [400, 950], hazardRating: 'VOLATILE', notes: 'Anomalous astral crystal emitting faint psychic static.' },
    { name: 'Sanctioned Arcane Tomes (Uncensored)', category: 'Banned Literature', weightRangeLbs: [20, 35], unitPriceRangeGp: [150, 400], hazardRating: 'ILLICIT', notes: 'Pre-schism historical texts detailing forbidden planar rituals.' },
  ],
};

const ORIGINS: Record<ManifestCategory, string[]> = {
  CARAVAN: ['Oakhaven Depot', 'Iron Mountain Waystation', 'High Sun Redoubt', 'Riverbend Market', 'Western Frontier Post'],
  SHIP_CARGO: ['Port Marigold', 'Crown Bay Wharf', 'Sunken Reef Anchorage', 'Harbor of the Twin Spires', 'Cape Tempest Docks'],
  CONTRABAND: ['The Undercroft Labyrinth', ' smuggler Cove #4', 'Shadow Quarter Cellar', 'Clandestine Salt Flat', 'Abandoned Quarry Vault'],
};

const DESTINATIONS = [
  'Imperial Trade Exchange',
  'Merchant League Depot',
  'Sanctuary Vault Stores',
  'Crossroads Bazaar',
  'Grand Citadel Armory',
  'Foreign Consular Warehouse',
];

const CARRIERS: Record<ManifestCategory, string[]> = {
  CARAVAN: ['Silver Hand Escort Co.', 'Iron Wheel Freight', 'Highland Mule Team #3', 'Oakhaven Mercantile Cartage'],
  SHIP_CARGO: ['Caravel "Wavecrest"', 'Galleon "Sea Drake"', 'Trade Brig "Fortunate Wind"', 'Cutter "Starling"'],
  CONTRABAND: ['Unmarked Night Skiff', 'Concealed Double-Floor Wagon', 'Shadow Runner Syndicate', 'Midnight Porters'],
};

function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a structured commercial trade manifest with bulk goods, crate counts,
 * weights, unit prices, and customs declarations.
 */
export function generateManifest(
  category: ManifestCategory = 'CARAVAN',
  valueTier: ManifestValueTier = 'WEALTHY'
): TradeManifest {
  const codeSuffix = Math.floor(1000 + Math.random() * 9000);
  const manifestCode = `MNF-${category.slice(0, 3)}-${codeSuffix}`;
  const now = Date.now();

  const originsList = ORIGINS[category];
  const carrierList = CARRIERS[category];
  const origin = originsList[Math.floor(Math.random() * originsList.length)];
  const destination = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
  const carrier = carrierList[Math.floor(Math.random() * carrierList.length)];

  // Tier multipliers
  const tierMultiplier = valueTier === 'MODEST' ? 0.7 : valueTier === 'WEALTHY' ? 1.4 : 3.0;
  const crateMultiplier = valueTier === 'MODEST' ? 1 : valueTier === 'WEALTHY' ? 2 : 4;

  const catalog = CARGO_CATALOG[category];
  // Select 3 to 5 random goods from the catalog
  const selectedCount = Math.min(catalog.length, randBetween(3, 5));
  const shuffled = [...catalog].sort(() => Math.random() - 0.5).slice(0, selectedCount);

  let totalCrates = 0;
  let totalWeightLbs = 0;
  let totalCustomsValueGp = 0;

  const items: ManifestCargoItem[] = shuffled.map((itemBlueprint, idx) => {
    const crateCount = randBetween(2, 6) * crateMultiplier;
    const weightPerCrate = randBetween(itemBlueprint.weightRangeLbs[0], itemBlueprint.weightRangeLbs[1]);
    const rawUnit = randBetween(itemBlueprint.unitPriceRangeGp[0], itemBlueprint.unitPriceRangeGp[1]);
    const unitPriceGp = Math.max(1, Math.round(rawUnit * tierMultiplier));

    const totalWeight = crateCount * weightPerCrate;
    const totalCustomsGp = crateCount * unitPriceGp;

    totalCrates += crateCount;
    totalWeightLbs += totalWeight;
    totalCustomsValueGp += totalCustomsGp;

    return {
      id: `cargo-${now}-${idx}`,
      name: itemBlueprint.name,
      category: itemBlueprint.category,
      crateCount,
      weightLbsPerCrate: weightPerCrate,
      totalWeightLbs: totalWeight,
      unitPriceGp,
      totalCustomsGp,
      hazardRating: itemBlueprint.hazardRating || 'SAFE',
      notes: itemBlueprint.notes,
    };
  });

  const titles: Record<ManifestCategory, string> = {
    CARAVAN: `Overland Trade Waybill (${valueTier.toLowerCase()} convoy)`,
    SHIP_CARGO: `Harbor Customs Bill of Lading (${valueTier.toLowerCase()} cargo)`,
    CONTRABAND: `Seized Black-Market Manifest (${valueTier.toLowerCase()} cache)`,
  };

  return {
    id: `manifest-${now}`,
    manifestCode,
    title: titles[category],
    category,
    valueTier,
    origin,
    destination,
    carrier,
    createdTimestamp: now,
    totalCrates,
    totalWeightLbs,
    totalCustomsValueGp,
    items,
  };
}

// ── 3. PARTY TREASURY & STASH INGESTION ───────────────────────────────────────

/**
 * Transfers generated manifest goods directly into the party stash / inventory store.
 * Automatically updates persistent storage and emits a confirmation sound event.
 */
export function addCargoToPartyStash(manifest: TradeManifest): {
  addedCount: number;
  totalWeightLbs: number;
  totalValueGp: number;
} {
  const newInventoryItems: InventoryItem[] = manifest.items.map(item => {
    return {
      id: `stash-cargo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      character_id: 'party-stash',
      name: `${item.name} (${item.crateCount} crates)`,
      quantity: item.crateCount,
      weight_lbs: item.totalWeightLbs,
      current_rp: 20,
      max_rp: 20,
      is_preserved: item.hazardRating !== 'PERISHABLE',
      harvest_timestamp: null,
      base_value_cp: Math.round(item.totalCustomsGp * 100),
      is_spoiled: false,
    };
  });

  // Update reactive Svelte store
  inventoryStore.update(current => [...current, ...newInventoryItems]);

  // Mirror to persistent party stash storage
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('vtt_party_stash');
      const existing: InventoryItem[] = raw ? JSON.parse(raw) : [];
      localStorage.setItem('vtt_party_stash', JSON.stringify([...existing, ...newInventoryItems]));
    }
  } catch { /* quota safe */ }

  // Sound & Event broadcast
  dispatchSoundEvent('coin_clink');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:cargo-added', {
        detail: {
          manifestCode: manifest.manifestCode,
          itemsCount: manifest.items.length,
          totalValueGp: manifest.totalCustomsValueGp,
        },
      })
    );
  }

  return {
    addedCount: manifest.items.length,
    totalWeightLbs: manifest.totalWeightLbs,
    totalValueGp: manifest.totalCustomsValueGp,
  };
}
