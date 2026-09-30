// src/lib/services/generators/lootGenerator.ts
// 5e SRD / DMG Procedural Loot Table Engine

import type { CustomItemDefinition } from '../../types/item';
import { forgeMagicItem } from './magicItemForge';

export type CrBracket = '0-4' | '5-10' | '11-16' | '17+';

export interface CoinPouch {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  totalGpEquivalent: number;
}

export interface ValuedObject {
  name: string;
  type: 'gemstone' | 'art';
  denominationGp: number;
  count: number;
  totalGp: number;
}

export interface LootResult {
  crBracket: CrBracket;
  isHoard: boolean;
  coins: CoinPouch;
  valuables: ValuedObject[];
  magicItems: CustomItemDefinition[];
  totalValueGp: number;
}

export interface LootOptions {
  cr?: number | string;
  isHoard?: boolean;
  seed?: number;
  magicItemCount?: number;
}

// ── Gemstone Catalog (5e SRD) ───────────────────────────────────────────────

const GEMSTONES_10_GP = [
  'Azurite', 'Banded Agate', 'Blue Quartz', 'Eye Agate', 'Hematite',
  'Lapis Lazuli', 'Malachite', 'Moss Agate', 'Obsidian', 'Rhodochrosite',
  'Tiger Eye', 'Turquoise'
];

const GEMSTONES_50_GP = [
  'Bloodstone', 'Carnelian', 'Chalcedony', 'Chrysoprase', 'Citrine',
  'Jasper', 'Moonstone', 'Onyx', 'Quartz', 'Sardonyx', 'Star Rose Quartz', 'Zircon'
];

const GEMSTONES_100_GP = [
  'Amber', 'Amethyst', 'Chrysoberyl', 'Coral', 'Garnet',
  'Jade', 'Jet', 'Pearl', 'Spinel', 'Tourmaline'
];

const GEMSTONES_500_GP = [
  'Alexandrite', 'Aquamarine', 'Black Pearl', 'Blue Spinel', 'Peridot', 'Topaz'
];

const GEMSTONES_1000_GP = [
  'Black Opal', 'Blue Sapphire', 'Emerald', 'Fire Opal',
  'Opal', 'Star Ruby', 'Star Sapphire', 'Yellow Sapphire'
];

const GEMSTONES_5000_GP = [
  'Black Sapphire', 'Diamond', 'Jacinth', 'Ruby'
];

// ── Art Object Catalog (5e SRD) ─────────────────────────────────────────────

const ART_OBJECTS_25_GP = [
  'Silver ewer', 'Carved bone statuette', 'Small gold bracelet',
  'Cloth-of-gold vestments', 'Black velvet mask with citrines'
];

const ART_OBJECTS_250_GP = [
  'Gold chalice with lapis lazuli', 'Silver-plated steel longsword with jet',
  'Carved harp of exotic wood', 'Small brass idol', 'Gold dragon figurine'
];

const ART_OBJECTS_750_GP = [
  'Silver chalice with moonstones', 'Carved ivory statuette',
  'Gold dragon comb with red garnets', 'Ceremonial silver dagger with star gems'
];

const ART_OBJECTS_2500_GP = [
  'Fine gold chain with fire opal', 'Carved ivory drinking horn',
  'Obsidian ceremonial dagger with gold filigree', 'Embroidered silk tapestry with pearls'
];

const ART_OBJECTS_7500_GP = [
  'Jeweled platinum tiara', 'Gold ring with black sapphire',
  'Imperial scepter set with rubies', 'Gold reliquary set with diamonds'
];

// ── Dice Algebra Helpers ────────────────────────────────────────────────────

function lcgRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function rollDice(count: number, sides: number, multiplier = 1, rng: () => number = Math.random): number {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += Math.floor(rng() * sides) + 1;
  }
  return sum * multiplier;
}

export function parseCrBracket(cr: number | string): CrBracket {
  const num = typeof cr === 'string' ? parseFloat(cr) : cr;
  if (isNaN(num) || num < 5) return '0-4';
  if (num < 11) return '5-10';
  if (num < 17) return '11-16';
  return '17+';
}

function calculateCoinTotalGp(coins: { cp: number; sp: number; ep: number; gp: number; pp: number }): number {
  return (
    coins.cp / 100 +
    coins.sp / 10 +
    coins.ep / 2 +
    coins.gp +
    coins.pp * 10
  );
}

// ── Individual Treasure Generation ──────────────────────────────────────────

export function generateIndividualTreasure(
  cr: number | string,
  rng: () => number = Math.random
): LootResult {
  const bracket = parseCrBracket(cr);
  const d100 = Math.floor(rng() * 100) + 1;

  let cp = 0;
  let sp = 0;
  let ep = 0;
  let gp = 0;
  let pp = 0;

  if (bracket === '0-4') {
    if (d100 <= 30) {
      cp = rollDice(5, 6, 1, rng);
    } else if (d100 <= 60) {
      sp = rollDice(4, 6, 1, rng);
    } else if (d100 <= 70) {
      ep = rollDice(3, 6, 1, rng);
    } else if (d100 <= 95) {
      gp = rollDice(3, 6, 1, rng);
    } else {
      pp = rollDice(1, 6, 1, rng);
    }
  } else if (bracket === '5-10') {
    if (d100 <= 30) {
      cp = rollDice(4, 6, 100, rng);
      ep = rollDice(1, 6, 10, rng);
    } else if (d100 <= 60) {
      sp = rollDice(6, 6, 10, rng);
      gp = rollDice(2, 6, 10, rng);
    } else if (d100 <= 70) {
      ep = rollDice(3, 6, 10, rng);
      gp = rollDice(2, 6, 10, rng);
    } else if (d100 <= 95) {
      gp = rollDice(4, 6, 10, rng);
    } else {
      gp = rollDice(2, 6, 10, rng);
      pp = rollDice(3, 6, 1, rng);
    }
  } else if (bracket === '11-16') {
    if (d100 <= 20) {
      sp = rollDice(4, 6, 100, rng);
      gp = rollDice(1, 6, 100, rng);
    } else if (d100 <= 35) {
      ep = rollDice(1, 6, 100, rng);
      gp = rollDice(1, 6, 100, rng);
    } else if (d100 <= 75) {
      gp = rollDice(2, 6, 100, rng);
      pp = rollDice(1, 6, 10, rng);
    } else {
      gp = rollDice(2, 6, 100, rng);
      pp = rollDice(2, 6, 10, rng);
    }
  } else {
    // 17+
    if (d100 <= 15) {
      ep = rollDice(2, 6, 1000, rng);
      gp = rollDice(8, 6, 100, rng);
    } else if (d100 <= 55) {
      gp = rollDice(1, 6, 1000, rng);
      pp = rollDice(1, 6, 100, rng);
    } else {
      gp = rollDice(1, 6, 1000, rng);
      pp = rollDice(2, 6, 100, rng);
    }
  }

  const totalGpEquivalent = Math.round(calculateCoinTotalGp({ cp, sp, ep, gp, pp }) * 100) / 100;

  return {
    crBracket: bracket,
    isHoard: false,
    coins: { cp, sp, ep, gp, pp, totalGpEquivalent },
    valuables: [],
    magicItems: [],
    totalValueGp: totalGpEquivalent
  };
}

// ── Treasure Hoard Generation ───────────────────────────────────────────────

export function generateTreasureHoard(
  cr: number | string,
  rng: () => number = Math.random,
  magicItemCountOverride?: number
): LootResult {
  const bracket = parseCrBracket(cr);
  const d100 = Math.floor(rng() * 100) + 1;

  let cp = 0;
  let sp = 0;
  let ep = 0;
  let gp = 0;
  let pp = 0;
  const valuables: ValuedObject[] = [];
  const magicItems: CustomItemDefinition[] = [];

  const pickRandom = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];

  if (bracket === '0-4') {
    cp = rollDice(6, 6, 100, rng);
    sp = rollDice(3, 6, 100, rng);
    gp = rollDice(2, 6, 10, rng);

    if (d100 >= 37 && d100 <= 60) {
      const count = rollDice(2, 6, 1, rng);
      valuables.push({
        name: pickRandom(GEMSTONES_10_GP),
        type: 'gemstone',
        denominationGp: 10,
        count,
        totalGp: count * 10
      });
    } else if (d100 >= 61 && d100 <= 75) {
      const count = rollDice(2, 4, 1, rng);
      valuables.push({
        name: pickRandom(ART_OBJECTS_25_GP),
        type: 'art',
        denominationGp: 25,
        count,
        totalGp: count * 25
      });
    } else if (d100 >= 76) {
      const count = rollDice(2, 6, 1, rng);
      valuables.push({
        name: pickRandom(GEMSTONES_50_GP),
        type: 'gemstone',
        denominationGp: 50,
        count,
        totalGp: count * 50
      });
    }

    const numItems = magicItemCountOverride !== undefined ? magicItemCountOverride : (d100 >= 53 ? rollDice(1, 4, 1, rng) : 0);
    for (let i = 0; i < numItems; i++) {
      magicItems.push(forgeMagicItem({ maxRarity: 'Uncommon', seed: Math.floor(rng() * 100000) }));
    }
  } else if (bracket === '5-10') {
    cp = rollDice(2, 6, 100, rng);
    sp = rollDice(2, 6, 1000, rng);
    gp = rollDice(6, 6, 100, rng);
    pp = rollDice(3, 6, 10, rng);

    if (d100 >= 29 && d100 <= 40) {
      const count = rollDice(2, 4, 1, rng);
      valuables.push({
        name: pickRandom(ART_OBJECTS_25_GP),
        type: 'art',
        denominationGp: 25,
        count,
        totalGp: count * 25
      });
    } else if (d100 >= 41 && d100 <= 69) {
      const count = rollDice(3, 6, 1, rng);
      valuables.push({
        name: pickRandom(GEMSTONES_50_GP),
        type: 'gemstone',
        denominationGp: 50,
        count,
        totalGp: count * 50
      });
    } else if (d100 >= 70 && d100 <= 88) {
      const count = rollDice(3, 6, 1, rng);
      valuables.push({
        name: pickRandom(GEMSTONES_100_GP),
        type: 'gemstone',
        denominationGp: 100,
        count,
        totalGp: count * 100
      });
    } else if (d100 >= 89) {
      const count = rollDice(2, 4, 1, rng);
      valuables.push({
        name: pickRandom(ART_OBJECTS_250_GP),
        type: 'art',
        denominationGp: 250,
        count,
        totalGp: count * 250
      });
    }

    const numItems = magicItemCountOverride !== undefined ? magicItemCountOverride : (d100 >= 35 ? rollDice(1, 4, 1, rng) : 0);
    for (let i = 0; i < numItems; i++) {
      magicItems.push(forgeMagicItem({ maxRarity: 'Rare', seed: Math.floor(rng() * 100000) }));
    }
  } else if (bracket === '11-16') {
    gp = rollDice(4, 6, 1000, rng);
    pp = rollDice(5, 6, 100, rng);

    if (d100 >= 16 && d100 <= 35) {
      const count = rollDice(2, 4, 1, rng);
      valuables.push({
        name: pickRandom(ART_OBJECTS_250_GP),
        type: 'art',
        denominationGp: 250,
        count,
        totalGp: count * 250
      });
    } else if (d100 >= 36 && d100 <= 60) {
      const count = rollDice(3, 6, 1, rng);
      valuables.push({
        name: pickRandom(ART_OBJECTS_750_GP),
        type: 'art',
        denominationGp: 750,
        count,
        totalGp: count * 750
      });
    } else if (d100 >= 61 && d100 <= 82) {
      const count = rollDice(3, 6, 1, rng);
      valuables.push({
        name: pickRandom(GEMSTONES_500_GP),
        type: 'gemstone',
        denominationGp: 500,
        count,
        totalGp: count * 500
      });
    } else if (d100 >= 83) {
      const count = rollDice(3, 6, 1, rng);
      valuables.push({
        name: pickRandom(GEMSTONES_1000_GP),
        type: 'gemstone',
        denominationGp: 1000,
        count,
        totalGp: count * 1000
      });
    }

    const numItems = magicItemCountOverride !== undefined ? magicItemCountOverride : (d100 >= 20 ? rollDice(1, 6, 1, rng) : 1);
    for (let i = 0; i < numItems; i++) {
      magicItems.push(forgeMagicItem({ maxRarity: 'Very Rare', seed: Math.floor(rng() * 100000) }));
    }
  } else {
    // 17+
    gp = rollDice(12, 6, 1000, rng);
    pp = rollDice(8, 6, 1000, rng);

    if (d100 <= 50) {
      const count = rollDice(3, 6, 1, rng);
      valuables.push({
        name: pickRandom(GEMSTONES_1000_GP),
        type: 'gemstone',
        denominationGp: 1000,
        count,
        totalGp: count * 1000
      });
    } else if (d100 <= 80) {
      const count = rollDice(1, 10, 1, rng);
      valuables.push({
        name: pickRandom(ART_OBJECTS_2500_GP),
        type: 'art',
        denominationGp: 2500,
        count,
        totalGp: count * 2500
      });
    } else {
      const count = rollDice(1, 4, 1, rng);
      valuables.push({
        name: pickRandom(ART_OBJECTS_7500_GP),
        type: 'art',
        denominationGp: 7500,
        count,
        totalGp: count * 7500
      });
    }

    const numItems = magicItemCountOverride !== undefined ? magicItemCountOverride : rollDice(1, 4, 1, rng);
    for (let i = 0; i < numItems; i++) {
      magicItems.push(forgeMagicItem({ maxRarity: 'Legendary', seed: Math.floor(rng() * 100000) }));
    }
  }

  const coinTotalGp = Math.round(calculateCoinTotalGp({ cp, sp, ep, gp, pp }) * 100) / 100;
  const valuablesTotalGp = valuables.reduce((sum, v) => sum + v.totalGp, 0);
  const magicItemsTotalGp = magicItems.reduce((sum, item) => sum + (item.costGp || 0), 0);
  const totalValueGp = coinTotalGp + valuablesTotalGp + magicItemsTotalGp;

  return {
    crBracket: bracket,
    isHoard: true,
    coins: { cp, sp, ep, gp, pp, totalGpEquivalent: coinTotalGp },
    valuables,
    magicItems,
    totalValueGp
  };
}

export function generateLoot(options: LootOptions = {}): LootResult {
  const rng = options.seed !== undefined ? lcgRandom(options.seed) : Math.random;
  const cr = options.cr !== undefined ? options.cr : 1;

  if (options.isHoard) {
    return generateTreasureHoard(cr, rng, options.magicItemCount);
  }
  return generateIndividualTreasure(cr, rng);
}
