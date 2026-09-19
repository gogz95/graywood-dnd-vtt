// alchemyMatrix.ts — Complete 28-essence combination matrix & crafting math engine
// Codifies 8 fundamental essences and their 28 unique binary recipes.

export type ElementalType =
  | 'FIRE'
  | 'WATER'
  | 'EARTH'
  | 'AIR'
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'ORDER'
  | 'CHAOS';

export interface EssenceDefinition {
  type: ElementalType;
  name: string;
  symbol: string;
  color: string;
  textColor: string;
  bgBadge: string;
  borderBadge: string;
  sourceDescription: string;
}

export const ESSENCE_REGISTRY: Record<ElementalType, EssenceDefinition> = {
  FIRE: {
    type: 'FIRE',
    name: 'Pyric Essence',
    symbol: '🔥',
    color: '#ef4444',
    textColor: 'text-rose-400',
    bgBadge: 'bg-rose-950/70',
    borderBadge: 'border-rose-700/60',
    sourceDescription: 'Extracted from fire elementals, red dragon glands, or magma salamanders.',
  },
  WATER: {
    type: 'WATER',
    name: 'Aquatic Essence',
    symbol: '💧',
    color: '#38bdf8',
    textColor: 'text-sky-400',
    bgBadge: 'bg-sky-950/70',
    borderBadge: 'border-sky-700/60',
    sourceDescription: 'Extracted from water weirds, aboleth mucus, or arctic frost worms.',
  },
  EARTH: {
    type: 'EARTH',
    name: 'Terrene Essence',
    symbol: '⛰️',
    color: '#d97706',
    textColor: 'text-amber-500',
    bgBadge: 'bg-amber-950/70',
    borderBadge: 'border-amber-700/60',
    sourceDescription: 'Extracted from earth elementals, gorgon plates, or bulette carapaces.',
  },
  AIR: {
    type: 'AIR',
    name: 'Aetheric Essence',
    symbol: '💨',
    color: '#a855f7',
    textColor: 'text-purple-400',
    bgBadge: 'bg-purple-950/70',
    borderBadge: 'border-purple-700/60',
    sourceDescription: 'Extracted from air elementals, pegasus feathers, or djinn breath.',
  },
  POSITIVE: {
    type: 'POSITIVE',
    name: 'Radiant Vitality',
    symbol: '☀️',
    color: '#facc15',
    textColor: 'text-yellow-300',
    bgBadge: 'bg-yellow-950/70',
    borderBadge: 'border-yellow-600/60',
    sourceDescription: 'Extracted from celestial blood, unicorn horns, or sun-drenched lotus blooms.',
  },
  NEGATIVE: {
    type: 'NEGATIVE',
    name: 'Mortis Necrosis',
    symbol: '💀',
    color: '#64748b',
    textColor: 'text-slate-400',
    bgBadge: 'bg-slate-900/90',
    borderBadge: 'border-slate-700/60',
    sourceDescription: 'Extracted from wraith ectoplasm, shadow demon bile, or grave moss.',
  },
  ORDER: {
    type: 'ORDER',
    name: 'Stasis / Arcane Force',
    symbol: '⚖️',
    color: '#6366f1',
    textColor: 'text-indigo-400',
    bgBadge: 'bg-indigo-950/70',
    borderBadge: 'border-indigo-700/60',
    sourceDescription: 'Extracted from modron cores, marut gears, or crystallized ley line resonance.',
  },
  CHAOS: {
    type: 'CHAOS',
    name: 'Acid / Entropic Flux',
    symbol: '☣️',
    color: '#22c55e',
    textColor: 'text-emerald-400',
    bgBadge: 'bg-emerald-950/70',
    borderBadge: 'border-emerald-700/60',
    sourceDescription: 'Extracted from black dragon acid, slaad tadpoles, or wild magic residue.',
  },
};

export interface AlchemyRecipe {
  id: string;
  essenceA: ElementalType;
  essenceB: ElementalType;
  name: string;
  category: 'Bomb' | 'Potion' | 'Toxin' | 'Oil' | 'Elixir';
  icon: string;
  description: string;
  radiusFeet?: number;
  saveDc?: number;
  saveType?: 'DEX' | 'CON' | 'STR' | 'WIS';
  damage?: string;
  damageType?: string;
  duration?: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare';
  valueGp: number;
}

/**
 * Complete 28-essence combination matrix (8 elements taken 2 at a time: 8*7/2 = 28 combinations)
 */
export const ESSENCE_MATRIX_RECIPES: AlchemyRecipe[] = [
  // ── 1. FIRE COMBINATIONS ──────────────────────────────────────────────────
  {
    id: 'shrapnel-bomb',
    essenceA: 'FIRE',
    essenceB: 'EARTH',
    name: 'Shrapnel Bomb',
    category: 'Bomb',
    icon: '💣',
    description: 'A pressurized clay sphere packed with obsidian shards. Explodes violently upon impact.',
    radiusFeet: 15,
    saveDc: 14,
    saveType: 'DEX',
    damage: '3d6 Piercing + 2d6 Fire',
    damageType: 'Piercing/Fire',
    rarity: 'Uncommon',
    valueGp: 75,
  },
  {
    id: 'scalding-steam-flask',
    essenceA: 'FIRE',
    essenceB: 'WATER',
    name: 'Scalding Steam Flask',
    category: 'Bomb',
    icon: '♨️',
    description: 'Vaporizes violently on impact, filling the area with blinding superheated steam.',
    radiusFeet: 20,
    saveDc: 13,
    saveType: 'CON',
    damage: '3d6 Fire (Scald)',
    damageType: 'Fire',
    duration: '1 minute (Heavily Obscured)',
    rarity: 'Common',
    valueGp: 45,
  },
  {
    id: 'combustion-flash-grenade',
    essenceA: 'FIRE',
    essenceB: 'AIR',
    name: 'Combustion Flash Grenade',
    category: 'Bomb',
    icon: '✨',
    description: 'Ignites atmospheric air into a concussive shockwave and blinding magnesium burst.',
    radiusFeet: 20,
    saveDc: 14,
    saveType: 'CON',
    damage: '2d8 Thunder',
    damageType: 'Thunder',
    duration: '1 round (Blinded & Deafened)',
    rarity: 'Uncommon',
    valueGp: 80,
  },
  {
    id: 'sunburst-elixir',
    essenceA: 'FIRE',
    essenceB: 'POSITIVE',
    name: 'Sunburst Weapon Elixir',
    category: 'Oil',
    icon: '🗡️',
    description: 'Coat a weapon for 1 hour. Weapon sheds 20ft bright light and deals bonus radiant flame damage.',
    damage: '+1d8 Radiant Fire',
    damageType: 'Radiant',
    duration: '1 hour',
    rarity: 'Rare',
    valueGp: 150,
  },
  {
    id: 'hellfire-phial',
    essenceA: 'FIRE',
    essenceB: 'NEGATIVE',
    name: 'Hellfire Phial',
    category: 'Bomb',
    icon: '🔥',
    description: 'Black unholy flames that consume flesh and soul. Creatures damaged cannot regain hit points for 1 minute.',
    radiusFeet: 15,
    saveDc: 15,
    saveType: 'DEX',
    damage: '4d6 Necrotic Fire',
    damageType: 'Necrotic',
    duration: '1 minute (No Regeneration)',
    rarity: 'Rare',
    valueGp: 180,
  },
  {
    id: 'concussive-thermite-charge',
    essenceA: 'FIRE',
    essenceB: 'ORDER',
    name: 'Concussive Thermite Charge',
    category: 'Bomb',
    icon: '🧨',
    description: 'Focused directional plasma charge engineered to melt iron portcullises, stone vaults, and structural colliders.',
    radiusFeet: 5,
    saveDc: 16,
    saveType: 'DEX',
    damage: '8d6 Force Fire (Double to Structures)',
    damageType: 'Force',
    rarity: 'Very Rare',
    valueGp: 350,
  },
  {
    id: 'wildfire-concoction',
    essenceA: 'FIRE',
    essenceB: 'CHAOS',
    name: 'Wildfire Concoction',
    category: 'Bomb',
    icon: '💥',
    description: 'Volatile napalm gel that clings to surfaces and spreads 5 feet outward each round for 3 rounds.',
    radiusFeet: 15,
    saveDc: 14,
    saveType: 'DEX',
    damage: '3d8 Fire + 1d8 Burning/Round',
    damageType: 'Fire',
    duration: '3 rounds',
    rarity: 'Uncommon',
    valueGp: 110,
  },

  // ── 2. WATER COMBINATIONS ─────────────────────────────────────────────────
  {
    id: 'paralytic-toxin',
    essenceA: 'WATER',
    essenceB: 'NEGATIVE',
    name: 'Paralytic Toxin (Viscous)',
    category: 'Toxin',
    icon: '🧪',
    description: 'Clear, viscous poison applied to weapons or food. Paralyzes the nervous system within seconds.',
    saveDc: 15,
    saveType: 'CON',
    duration: '1 minute (Paralyzed, repeat save end of turn)',
    rarity: 'Rare',
    valueGp: 200,
  },
  {
    id: 'quicksand-slime-adhesive',
    essenceA: 'WATER',
    essenceB: 'EARTH',
    name: 'Quicksand Slime Adhesive',
    category: 'Bomb',
    icon: '🕸️',
    description: 'Thick hyper-dense mud that rapidly expands across the ground, trapping creatures in hardened muck.',
    radiusFeet: 20,
    saveDc: 14,
    saveType: 'STR',
    duration: '1 minute (Restrained, Difficult Terrain)',
    rarity: 'Common',
    valueGp: 50,
  },
  {
    id: 'cryo-mist-phial',
    essenceA: 'WATER',
    essenceB: 'AIR',
    name: 'Cryo-Mist Phial',
    category: 'Bomb',
    icon: '❄️',
    description: 'Instantly flash-freezes water and blankets the area in sub-zero frost, halving target movement speed.',
    radiusFeet: 15,
    saveDc: 14,
    saveType: 'CON',
    damage: '3d6 Cold',
    damageType: 'Cold',
    duration: '1 minute (Speed Halved)',
    rarity: 'Uncommon',
    valueGp: 85,
  },
  {
    id: 'elixir-of-panacea',
    essenceA: 'WATER',
    essenceB: 'POSITIVE',
    name: 'Elixir of Panacea',
    category: 'Elixir',
    icon: '💖',
    description: 'Consuming this pearlescent draught cures all mundane poisons, diseases, and restores 4d4+4 hit points.',
    damage: '4d4+4 Healing',
    damageType: 'Healing',
    rarity: 'Uncommon',
    valueGp: 120,
  },
  {
    id: 'draught-of-mind-stasis',
    essenceA: 'WATER',
    essenceB: 'ORDER',
    name: 'Draught of Mind Stasis',
    category: 'Potion',
    icon: '🧠',
    description: 'Calms the mind into mathematical equilibrium. Grants advantage on INT/WIS saves and immunity to Charmed.',
    duration: '1 hour',
    rarity: 'Rare',
    valueGp: 160,
  },
  {
    id: 'acidic-dissolvent',
    essenceA: 'WATER',
    essenceB: 'CHAOS',
    name: 'Acidic Dissolvent Flask',
    category: 'Bomb',
    icon: '🧪',
    description: 'Corrosive bile that devours nonmagical armors. Permanently applies a -2 penalty to targeted equipment RP.',
    saveDc: 15,
    saveType: 'DEX',
    damage: '4d6 Acid (-2 Equipment Durability)',
    damageType: 'Acid',
    rarity: 'Uncommon',
    valueGp: 95,
  },

  // ── 3. EARTH COMBINATIONS ─────────────────────────────────────────────────
  {
    id: 'petrifying-spore-dust',
    essenceA: 'EARTH',
    essenceB: 'AIR',
    name: 'Petrifying Spore Dust',
    category: 'Bomb',
    icon: '🗿',
    description: 'Airborne calcifying spores. Failing the save slows target; failing a second consecutive save petrifies.',
    radiusFeet: 10,
    saveDc: 14,
    saveType: 'CON',
    duration: '1 minute (Restrained -> Petrified)',
    rarity: 'Very Rare',
    valueGp: 400,
  },
  {
    id: 'stoneskin-ointment',
    essenceA: 'EARTH',
    essenceB: 'POSITIVE',
    name: 'Stoneskin Ointment',
    category: 'Oil',
    icon: '🛡️',
    description: 'Applied to flesh. Grants resistance to nonmagical Bludgeoning, Piercing, and Slashing damage for 1 hour.',
    duration: '1 hour',
    rarity: 'Rare',
    valueGp: 250,
  },
  {
    id: 'grave-dirt-dust',
    essenceA: 'EARTH',
    essenceB: 'NEGATIVE',
    name: 'Grave Dirt Blinding Powder',
    category: 'Toxin',
    icon: '🪦',
    description: 'Necrotizing dust thrown in eyes. Blinds the target and withers natural plant/wooden obstacles.',
    saveDc: 14,
    saveType: 'CON',
    duration: '1 minute (Blinded)',
    rarity: 'Common',
    valueGp: 60,
  },
  {
    id: 'adamantine-bonding-varnish',
    essenceA: 'EARTH',
    essenceB: 'ORDER',
    name: 'Adamantine Bonding Varnish',
    category: 'Oil',
    icon: '💎',
    description: 'Hardens weapon or shield. Completely restores all equipment Resistance Points (RP) and prevents sunder for 8 hours.',
    duration: '8 hours',
    rarity: 'Rare',
    valueGp: 220,
  },
  {
    id: 'tremor-powder-mine',
    essenceA: 'EARTH',
    essenceB: 'CHAOS',
    name: 'Tremor Powder Mine',
    category: 'Bomb',
    icon: '🌋',
    description: 'Concealed plate detonating on pressure. Shakes the subterranean floor, knocking all creatures in radius prone.',
    radiusFeet: 20,
    saveDc: 15,
    saveType: 'STR',
    damage: '3d8 Bludgeoning (Knocked Prone)',
    damageType: 'Bludgeoning',
    rarity: 'Uncommon',
    valueGp: 100,
  },

  // ── 4. AIR COMBINATIONS ───────────────────────────────────────────────────
  {
    id: 'draught-of-zephyr-flight',
    essenceA: 'AIR',
    essenceB: 'POSITIVE',
    name: 'Draught of Zephyr Flight',
    category: 'Potion',
    icon: '🪶',
    description: 'Imbues the drinker with weightless buoyancy, granting a flying speed of 60 feet for 10 minutes.',
    duration: '10 minutes (Fly 60 ft)',
    rarity: 'Rare',
    valueGp: 300,
  },
  {
    id: 'choking-miasma-vapor',
    essenceA: 'AIR',
    essenceB: 'NEGATIVE',
    name: 'Choking Miasma Vapor',
    category: 'Bomb',
    icon: '☠️',
    description: 'Expels thick, oxygen-depleting black smoke. Creatures within cannot breathe or cast verbal components.',
    radiusFeet: 20,
    saveDc: 15,
    saveType: 'CON',
    duration: '1 minute (Suffocation & Silence)',
    rarity: 'Rare',
    valueGp: 175,
  },
  {
    id: 'gaseous-form-philter',
    essenceA: 'AIR',
    essenceB: 'ORDER',
    name: 'Gaseous Form Philter',
    category: 'Potion',
    icon: '🌫️',
    description: 'Transforms user and gear into a misty cloud, allowing passage through cracks, keyholes, and portcullises.',
    duration: '1 hour',
    rarity: 'Rare',
    valueGp: 250,
  },
  {
    id: 'thunderstone-grenade',
    essenceA: 'AIR',
    essenceB: 'CHAOS',
    name: 'Thunderstone Grenade',
    category: 'Bomb',
    icon: '⚡',
    description: 'Emits a deafening sonic boom. Creatures within radius take thunder damage and are pushed 15 feet away.',
    radiusFeet: 15,
    saveDc: 14,
    saveType: 'STR',
    damage: '3d8 Thunder (15ft Pushback)',
    damageType: 'Thunder',
    rarity: 'Uncommon',
    valueGp: 85,
  },

  // ── 5. POSITIVE COMBINATIONS ──────────────────────────────────────────────
  {
    id: 'twilight-balancer',
    essenceA: 'POSITIVE',
    essenceB: 'NEGATIVE',
    name: 'Twilight Balancer Drought',
    category: 'Potion',
    icon: '🌗',
    description: 'Harmonizes life and death. Grants 20 temporary hit points; the next melee attack deals an extra 20 necrotic damage.',
    damage: '20 Temp HP + 20 Necrotic Discharge',
    damageType: 'Radiant/Necrotic',
    duration: '1 hour',
    rarity: 'Rare',
    valueGp: 260,
  },
  {
    id: 'aegis-philter',
    essenceA: 'POSITIVE',
    essenceB: 'ORDER',
    name: 'Aegis Philter of Invulnerability',
    category: 'Potion',
    icon: '🛡️',
    description: 'Projects a hardlight crystalline ward. Grants +2 bonus to Armor Class and total immunity to critical hits for 1 hour.',
    duration: '1 hour (+2 AC, No Crits)',
    rarity: 'Very Rare',
    valueGp: 500,
  },
  {
    id: 'mutagenic-surge-elixir',
    essenceA: 'POSITIVE',
    essenceB: 'CHAOS',
    name: 'Mutagenic Surge Elixir',
    category: 'Elixir',
    icon: '🧬',
    description: 'Wild alchemical catalyst. Grants darkvision 120ft, +10ft base speed, and 1 random primal adaptation for 1 hour.',
    duration: '1 hour (Speed +10ft, Darkvision)',
    rarity: 'Uncommon',
    valueGp: 130,
  },

  // ── 6. NEGATIVE COMBINATIONS ──────────────────────────────────────────────
  {
    id: 'soul-shackling-toxin',
    essenceA: 'NEGATIVE',
    essenceB: 'ORDER',
    name: 'Soul-Shackling Toxin',
    category: 'Toxin',
    icon: '⛓️',
    description: 'Anchors targets to the prime material plane. Creatures poisoned cannot teleport, plane shift, or enter ethereal form.',
    saveDc: 16,
    saveType: 'WIS',
    duration: '1 hour (Dimensional Anchor)',
    rarity: 'Very Rare',
    valueGp: 450,
  },
  {
    id: 'virulent-plague-phial',
    essenceA: 'NEGATIVE',
    essenceB: 'CHAOS',
    name: 'Virulent Plague Phial',
    category: 'Bomb',
    icon: '🧫',
    description: 'Shatters into a contagious cloud of necrotic rot. Infected targets take ongoing damage and spread infection on contact.',
    radiusFeet: 15,
    saveDc: 15,
    saveType: 'CON',
    damage: '3d8 Necrotic + 2d4/Round',
    damageType: 'Necrotic',
    duration: '1 minute (Contagious)',
    rarity: 'Rare',
    valueGp: 280,
  },

  // ── 7. ORDER & CHAOS COMBINATIONS ─────────────────────────────────────────
  {
    id: 'entropic-flux-catalyst',
    essenceA: 'ORDER',
    essenceB: 'CHAOS',
    name: 'Entropic Flux Grenade',
    category: 'Bomb',
    icon: '🌀',
    description: 'Warps the local fabric of reality. Randomizes magical defenses, dispelling lowest active spell buff on hit creatures.',
    radiusFeet: 20,
    saveDc: 16,
    saveType: 'WIS',
    damage: '4d8 Force (Dispel Magic 3rd lvl)',
    damageType: 'Force',
    rarity: 'Very Rare',
    valueGp: 550,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// CRAFTING FORMULAS & WORKBENCH LOGISTICS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Aleamos Ingredient-Point Formula:
 * Calculates 10 points for the first ingredient + 15 points per additional ingredient.
 */
export function calculateIngredientPoints(ingredientCount: number): number {
  if (ingredientCount <= 0) return 0;
  return 10 + (ingredientCount - 1) * 15;
}

/**
 * 4-hour uninterrupted work session per 25 points.
 */
export function calculateWorkHours(totalPoints: number): number {
  if (totalPoints <= 0) return 0;
  return Math.ceil(totalPoints / 25) * 4;
}

/**
 * Workshop Restrictions:
 * Simple brews (<= 25 points) craftable at camp;
 * Complex brews (> 25 points) strictly require an owned Stronghold Alchemical Laboratory.
 */
export function requiresStrongholdLab(totalPoints: number): boolean {
  return totalPoints > 25;
}

/**
 * Looks up resulting recipe for two slotted essences (order-independent).
 */
export function lookupEssenceCombination(
  essenceA: ElementalType,
  essenceB: ElementalType
): AlchemyRecipe | null {
  return (
    ESSENCE_MATRIX_RECIPES.find(
      (r) =>
        (r.essenceA === essenceA && r.essenceB === essenceB) ||
        (r.essenceA === essenceB && r.essenceB === essenceA)
    ) ?? null
  );
}
