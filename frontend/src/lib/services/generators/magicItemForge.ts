// src/lib/services/generators/magicItemForge.ts
// Procedural Magic Item Forge (ArcaneForge Pattern)

import type { CustomItemDefinition, ItemType, ItemRarity } from '../../types/item';
import { compendiumDb, type CompendiumItem } from '../../db/compendiumDb';
import { addCustomItem } from '../../stores/compendiumStore';

export interface BaseEquipmentTemplate {
  name: string;
  type: ItemType;
  category: string;
  weight: number;
  baseCostGp: number;
  damageFormula?: string;
  damageType?: string;
  attackBonus?: number;
  acBonus?: number;
  properties?: string[];
  description: string;
}

export interface ForgePrefix {
  name: string;
  rarityWeight: number; // 0 to 4
  attackBonus?: number;
  acBonus?: number;
  extraDamage?: string;
  damageType?: string;
  description: string;
}

export interface ForgeSuffix {
  name: string;
  rarityWeight: number; // 0 to 5
  requiresAttunement: boolean;
  charges?: number;
  description: string;
}

export interface MagicForgeOptions {
  type?: ItemType;
  baseTemplateName?: string;
  maxRarity?: ItemRarity;
  minRarity?: ItemRarity;
  requiresAttunement?: boolean;
  seed?: number;
}

// ── Base Equipment Templates ────────────────────────────────────────────────

export const WEAPON_TEMPLATES: BaseEquipmentTemplate[] = [
  {
    name: 'Longsword',
    type: 'weapon',
    category: 'Martial Melee',
    weight: 3,
    baseCostGp: 15,
    damageFormula: '1d8',
    damageType: 'slashing',
    properties: ['Versatile (1d10)'],
    description: 'A finely balanced double-edged steel blade.'
  },
  {
    name: 'Shortsword',
    type: 'weapon',
    category: 'Martial Melee',
    weight: 2,
    baseCostGp: 10,
    damageFormula: '1d6',
    damageType: 'piercing',
    properties: ['Finesse', 'Light'],
    description: 'A light, agile blade tailored for swift thrusts.'
  },
  {
    name: 'Greatsword',
    type: 'weapon',
    category: 'Martial Melee',
    weight: 6,
    baseCostGp: 50,
    damageFormula: '2d6',
    damageType: 'slashing',
    properties: ['Heavy', 'Two-Handed'],
    description: 'A massive two-handed sword designed for crushing cleaves.'
  },
  {
    name: 'Dagger',
    type: 'weapon',
    category: 'Simple Melee',
    weight: 1,
    baseCostGp: 2,
    damageFormula: '1d4',
    damageType: 'piercing',
    properties: ['Finesse', 'Light', 'Thrown (20/60)'],
    description: 'A concealable blade suited for backstabs and thrown strikes.'
  },
  {
    name: 'Rapier',
    type: 'weapon',
    category: 'Martial Melee',
    weight: 2,
    baseCostGp: 25,
    damageFormula: '1d8',
    damageType: 'piercing',
    properties: ['Finesse'],
    description: 'A slender, sharp-pointed sword favored by dueling nobles.'
  },
  {
    name: 'Battleaxe',
    type: 'weapon',
    category: 'Martial Melee',
    weight: 4,
    baseCostGp: 10,
    damageFormula: '1d8',
    damageType: 'slashing',
    properties: ['Versatile (1d10)'],
    description: 'A broad bearded axe built for breaking shield lines.'
  },
  {
    name: 'Longbow',
    type: 'weapon',
    category: 'Martial Ranged',
    weight: 2,
    baseCostGp: 50,
    damageFormula: '1d8',
    damageType: 'piercing',
    properties: ['Ammunition (150/600)', 'Heavy', 'Two-Handed'],
    description: 'A tall yew bow capable of piercing armor at great distances.'
  }
];

export const ARMOR_TEMPLATES: BaseEquipmentTemplate[] = [
  {
    name: 'Studded Leather Armor',
    type: 'armor',
    category: 'Light Armor',
    weight: 13,
    baseCostGp: 45,
    acBonus: 12,
    description: 'Tough, supple leather reinforced with close-set rivets.'
  },
  {
    name: 'Breastplate',
    type: 'armor',
    category: 'Medium Armor',
    weight: 20,
    baseCostGp: 400,
    acBonus: 14,
    description: 'Fitted metal chest piece with leather backing, leaving limbs free.'
  },
  {
    name: 'Half Plate',
    type: 'armor',
    category: 'Medium Armor',
    weight: 40,
    baseCostGp: 750,
    acBonus: 15,
    properties: ['Stealth Disadvantage'],
    description: 'Shaped metal plates covering most of the torso and limbs.'
  },
  {
    name: 'Plate Armor',
    type: 'armor',
    category: 'Heavy Armor',
    weight: 65,
    baseCostGp: 1500,
    acBonus: 18,
    properties: ['STR 15 Required', 'Stealth Disadvantage'],
    description: 'Interlocking steel plates encasing the entire body in steel.'
  },
  {
    name: 'Shield',
    type: 'armor',
    category: 'Shield',
    weight: 6,
    baseCostGp: 10,
    acBonus: 2,
    description: 'A sturdy wood or steel buckler that straps to the forearm.'
  }
];

export const WONDROUS_TEMPLATES: BaseEquipmentTemplate[] = [
  {
    name: 'Signet Ring',
    type: 'wondrous',
    category: 'Ring',
    weight: 0.1,
    baseCostGp: 50,
    description: 'An ornate band bearing an engraved heraldic glyph.'
  },
  {
    name: 'Amulet',
    type: 'wondrous',
    category: 'Amulet',
    weight: 0.5,
    baseCostGp: 30,
    description: 'A polished talisman suspended on a fine silver link chain.'
  },
  {
    name: 'Traveler Cloak',
    type: 'wondrous',
    category: 'Cloak',
    weight: 1,
    baseCostGp: 20,
    description: 'A weather-resistant hooded mantle that drapes over armor.'
  },
  {
    name: 'Boots',
    type: 'wondrous',
    category: 'Boots',
    weight: 2,
    baseCostGp: 25,
    description: 'Supple leather boots with reinforced soles for hard marches.'
  },
  {
    name: 'Arcane Wand',
    type: 'wondrous',
    category: 'Wand',
    weight: 1,
    baseCostGp: 100,
    description: 'A shaped wand of petrified ash core-threaded with crystal.'
  },
  {
    name: 'Bracers',
    type: 'wondrous',
    category: 'Bracers',
    weight: 1,
    baseCostGp: 40,
    description: 'Hardened leather or bronze guards that clasp the forearms.'
  }
];

// ── Prefixes (Elemental / Material / Enhancements) ───────────────────────────

const PREFIXES: ForgePrefix[] = [
  {
    name: 'Flaming',
    rarityWeight: 3,
    extraDamage: '1d6',
    damageType: 'fire',
    description: 'Sheds bright light in a 20-foot radius and deals an additional 1d6 fire damage on hit.'
  },
  {
    name: 'Frostforged',
    rarityWeight: 3,
    extraDamage: '1d6',
    damageType: 'cold',
    description: 'Rime frost clings to the surface, dealing an extra 1d6 cold damage and slowing foes by 10 ft on a critical.'
  },
  {
    name: 'Thunderous',
    rarityWeight: 3,
    extraDamage: '1d6',
    damageType: 'thunder',
    description: 'Crackles with resonant sonic energy, dealing 1d6 thunder damage.'
  },
  {
    name: 'Radiant',
    rarityWeight: 4,
    extraDamage: '1d8',
    damageType: 'radiant',
    description: 'Bathed in celestial dawnlight, dealing 1d8 radiant damage to fiends and undead.'
  },
  {
    name: 'Adamantine',
    rarityWeight: 2,
    description: 'Forged from ultra-dense adamantine. Any critical hit against the wearer becomes a normal hit, or weapon automatically crits objects.'
  },
  {
    name: 'Mithral',
    rarityWeight: 1,
    description: 'Extremely light and flexible. Removes any Stealth disadvantage and reduces weight by half.'
  },
  {
    name: 'Ghost-Touched',
    rarityWeight: 2,
    description: 'Can strike incorporeal creatures and ethereal beings as if they were solid material.'
  },
  {
    name: 'Vampiric',
    rarityWeight: 4,
    extraDamage: '1d4',
    damageType: 'necrotic',
    description: 'Drains life from wounded enemies, restoring hit points equal to necrotic damage dealt.'
  },
  {
    name: 'Zephyr',
    rarityWeight: 2,
    description: 'Increases the bearer’s walking speed by 10 feet and grants advantage on initiative rolls.'
  },
  {
    name: 'Honed (+1)',
    rarityWeight: 2,
    attackBonus: 1,
    acBonus: 1,
    description: 'Grants a +1 bonus to attack and damage rolls (or +1 to Armor Class if armor).'
  },
  {
    name: 'Masterwork (+2)',
    rarityWeight: 4,
    attackBonus: 2,
    acBonus: 2,
    description: 'Grants a +2 bonus to attack and damage rolls (or +2 to Armor Class if armor).'
  },
  {
    name: 'Ancient (+3)',
    rarityWeight: 6,
    attackBonus: 3,
    acBonus: 3,
    description: 'Grants an extraordinary +3 bonus to attack and damage rolls (or +3 to Armor Class if armor).'
  }
];

// ── Suffixes (Major Boons / Charges / Spells) ────────────────────────────────

const SUFFIXES: ForgeSuffix[] = [
  {
    name: 'of the Phoenix',
    rarityWeight: 4,
    requiresAttunement: true,
    charges: 3,
    description: 'Has 3 charges. When you drop to 0 HP, you can expend 1 charge to instantly erupt in flame and regain 20 HP.'
  },
  {
    name: 'of the Titan',
    rarityWeight: 3,
    requiresAttunement: true,
    description: 'Grants advantage on Strength checks and double damage against structures and siege objects.'
  },
  {
    name: 'of Spell Warding',
    rarityWeight: 4,
    requiresAttunement: true,
    description: 'You have advantage on saving throws against spells and magical effects while wielding this item.'
  },
  {
    name: 'of Blinding Speed',
    rarityWeight: 2,
    requiresAttunement: false,
    description: 'Allows taking the Dash or Disengage action as a Bonus Action once per short rest.'
  },
  {
    name: 'of the Deep Delver',
    rarityWeight: 1,
    requiresAttunement: false,
    description: 'Grants darkvision up to 60 feet (or increases existing darkvision by 30 feet).'
  },
  {
    name: 'of the Dragon’s Roar',
    rarityWeight: 3,
    requiresAttunement: true,
    charges: 3,
    description: 'Expend 1 charge to unleash a draconic cone roar (DC 15 Wisdom save or frightened for 1 minute).'
  },
  {
    name: 'of the Runecarver',
    rarityWeight: 2,
    requiresAttunement: false,
    description: 'Inscribed with dwarven runes granting +1 to spell attack rolls or saving throw DCs.'
  },
  {
    name: 'of Aleamos',
    rarityWeight: 3,
    requiresAttunement: false,
    description: 'Immune to temporal sunder and corrosion decay. Maintains permanent pristine durability.'
  }
];

// ── Minor Quirks & Creator Lore ──────────────────────────────────────────────

const CREATOR_ORIGINS = [
  'Forged by Elven Sunsmiths during the First Age of Gold.',
  'Crafted in the subterranean magma forges of the Dwarven Runemasters.',
  'Engineered by Netherese Arcanists prior to the celestial sundering.',
  'Bestowed by an enigmatic Archfey of the Autumn Court.',
  'Consecrated in the radiant halls of Mount Celestia.',
  'Recovered from the hoard of an ancient red wyrm.'
];

const MINOR_QUIRKS = [
  'Whispers faint battle hymns when drawn from its scabbard.',
  'Glows with a soft azure luminescence when fiends or undead are within 60 feet.',
  'Never collects dust, ash, or bloodstains, remaining immaculately polished.',
  'Grows pleasantly warm to the touch when danger approaches.',
  'Emits the faint, crisp scent of autumn leaves and ozone.'
];

// ── PRNG & Synthesis Engine ──────────────────────────────────────────────────

function lcgRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const RARITY_WEIGHT_TABLE: Record<ItemRarity, number> = {
  Common: 1,
  Uncommon: 3,
  Rare: 5,
  'Very Rare': 7,
  Legendary: 10,
  Artifact: 14
};

export function forgeMagicItem(options: MagicForgeOptions = {}): CustomItemDefinition {
  const rng = options.seed !== undefined ? lcgRandom(options.seed) : Math.random;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  // 1. Pick Template
  let pool = [...WEAPON_TEMPLATES, ...ARMOR_TEMPLATES, ...WONDROUS_TEMPLATES];
  if (options.type === 'weapon') pool = WEAPON_TEMPLATES;
  else if (options.type === 'armor') pool = ARMOR_TEMPLATES;
  else if (options.type === 'wondrous') pool = WONDROUS_TEMPLATES;

  let template = pick(pool);
  if (options.baseTemplateName) {
    const found = pool.find(t => t.name.toLowerCase() === options.baseTemplateName?.toLowerCase());
    if (found) template = found;
  }

  // 2. Pick Prefix & Suffix
  const prefix = pick(PREFIXES);
  const suffix = pick(SUFFIXES);

  // 3. Compute Rarity Score
  const totalScore = prefix.rarityWeight + suffix.rarityWeight;
  let rarity: ItemRarity = 'Common';
  if (totalScore >= 9) rarity = 'Legendary';
  else if (totalScore >= 6) rarity = 'Very Rare';
  else if (totalScore >= 4) rarity = 'Rare';
  else if (totalScore >= 2) rarity = 'Uncommon';

  if (options.maxRarity) {
    const maxScore = RARITY_WEIGHT_TABLE[options.maxRarity];
    if (RARITY_WEIGHT_TABLE[rarity] > maxScore) {
      rarity = options.maxRarity;
    }
  }

  if (options.minRarity) {
    const minScore = RARITY_WEIGHT_TABLE[options.minRarity];
    if (RARITY_WEIGHT_TABLE[rarity] < minScore) {
      rarity = options.minRarity;
    }
  }

  // 4. Compute Name
  const fullName = `${prefix.name} ${template.name} ${suffix.name}`;

  // 5. Attunement & Charges
  const requiresAttunement =
    options.requiresAttunement !== undefined
      ? options.requiresAttunement
      : suffix.requiresAttunement;

  // 6. Gold Price Calculation (5e SRD + Sane Curve)
  let costGp = template.baseCostGp;
  switch (rarity) {
    case 'Common':
      costGp += 50 + Math.floor(rng() * 50);
      break;
    case 'Uncommon':
      costGp += 300 + Math.floor(rng() * 400);
      break;
    case 'Rare':
      costGp += 2500 + Math.floor(rng() * 3000);
      break;
    case 'Very Rare':
      costGp += 15000 + Math.floor(rng() * 15000);
      break;
    case 'Legendary':
    case 'Artifact':
      costGp += 60000 + Math.floor(rng() * 50000);
      break;
  }

  // 7. Assemble Full Description
  const creator = pick(CREATOR_ORIGINS);
  const quirk = pick(MINOR_QUIRKS);
  const descParagraphs = [
    template.description,
    `${prefix.name}: ${prefix.description}`,
    `${suffix.name}: ${suffix.description}`,
    `Lore: ${creator}`,
    `Quirk: ${quirk}`
  ];

  const fullDescription = descParagraphs.filter(Boolean).join('\n\n');

  // 8. Combat Attributes
  let attackBonus = template.attackBonus || 0;
  if (prefix.attackBonus && template.type === 'weapon') {
    attackBonus += prefix.attackBonus;
  }

  let acBonus = template.acBonus || 0;
  if (prefix.acBonus && template.type === 'armor') {
    acBonus += prefix.acBonus;
  }

  const properties = [...(template.properties || [])];
  if (prefix.extraDamage) {
    properties.push(`+${prefix.extraDamage} ${prefix.damageType}`);
  }
  if (suffix.charges) {
    properties.push(`${suffix.charges} Charges`);
  }

  const id = `item-forge-${Date.now()}-${Math.floor(rng() * 10000)}`;

  return {
    id,
    name: fullName,
    type: template.type,
    category: template.category,
    rarity,
    weight: template.weight,
    costGp,
    description: fullDescription,
    currentRp: 50,
    maxRp: 50,
    attackBonus: attackBonus > 0 ? attackBonus : undefined,
    damageFormula: template.damageFormula,
    damageType: template.damageType,
    acBonus: acBonus > 0 ? acBonus : undefined,
    requiresAttunement,
    properties,
    source: 'custom',
    createdAt: Date.now()
  };
}

// ── Compendium Persistence ──────────────────────────────────────────────────

export async function saveMagicItemToCompendium(item: CustomItemDefinition): Promise<void> {
  // 1. IndexedDB custom items store
  try {
    await addCustomItem(item);
  } catch (err) {
    console.warn('[magicItemForge] IndexedDB persistence error:', err);
  }

  // 2. Dexie compendium database
  try {
    const compendiumItem: CompendiumItem = {
      id: item.id,
      name: item.name,
      type: item.type,
      rarity: item.rarity,
      attunement: item.requiresAttunement ? 'Requires Attunement' : undefined,
      damage: item.damageFormula,
      armorClass: item.acBonus,
      properties: item.properties,
      description: item.description,
      weight: item.weight,
      cost: `${item.costGp || 0} gp`,
      sourceBook: 'Magic Item Forge',
      packageId: 'procedural-items',
      origin: 'USER_IMPORT'
    };
    await compendiumDb.items.put(compendiumItem);
  } catch (err) {
    console.warn('[magicItemForge] Dexie items persistence error:', err);
  }

  // 3. SQLite REST backend persistence
  if (typeof fetch !== 'undefined') {
    try {
      await fetch('/api/compendium/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          type: item.type,
          rarity: item.rarity,
          cost_gp: item.costGp || 0,
          weight: item.weight,
          description: item.description,
          source: 'Magic Item Forge'
        })
      });
    } catch {
      // Backend may be offline in dev/test; IndexedDB & Dexie provide primary offline guarantee
    }
  }
}
