// src/lib/db/compendiumDb.ts
// Dynamic 5e SRD Compendium Database powered by Dexie.js (IndexedDB)
// Initialized with pure CC-BY-4.0 5e SRD 5.1 baselines (origin: 'SRD-5.1')
// Supports modular user package imports and atomic package purging without touching SRD records.

import Dexie, { type Table } from 'dexie';
import type { IngestedTable } from '../types/compendium';

export interface CompendiumSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  parentClass?: string[]; // e.g. ['Wizard', 'Sorcerer']
  castingTime: string;
  casting_time?: string;
  range: string;
  components: string;
  duration: string;
  concentration?: boolean;
  ritual?: boolean;
  description: string;
  sourceBook: string;
  packageId: string;
  origin: 'SRD-5.1' | 'USER_IMPORT';
}

export interface CompendiumSubclass {
  id: string;
  parentClass: string;
  name: string;
  featuresByLevel: Record<number, string[]>;
  sourceBook: string;
  packageId: string;
  origin: 'SRD-5.1' | 'USER_IMPORT';
}

export interface CompendiumMonster {
  id: string;
  name: string;
  cr: number;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  hp: number;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  hitDice?: string;
  savingThrows?: string;
  skills?: string;
  senses?: string;
  languages?: string;
  traits?: Array<{ name: string; description: string }>;
  actions: Array<{ name: string; description: string }>;
  legendary_actions?: Array<{ name: string; description: string }>;
  legendaryActions?: Array<{ name: string; description: string }>;
  sourceBook: string;
  packageId: string;
  origin: 'SRD-5.1' | 'USER_IMPORT';
}

export interface CompendiumFacility {
  id: string;
  name: string;
  category: 'Crafting' | 'Military' | 'Arcane' | 'Commerce' | 'Espionage';
  goldCost: number;
  buildDays: number;
  benefits: string;
  sourceBook: string;
  packageId: string;
  origin: 'SRD-5.1' | 'USER_IMPORT';
}

export interface CompendiumMedia {
  id: string;
  name: string;
  sourceBook: string;
  mimeType: string;
  createdAt: number;
  url?: string;
  blob?: Blob;
  category?: string;
}

export interface CompendiumItem {
  id: string;
  name: string;
  type: string;
  rarity: string;
  attunement?: boolean | string;
  damage?: string;
  armorClass?: number;
  properties?: string[];
  description: string;
  weight?: number;
  cost?: string;
  sourceBook: string;
  packageId: string;
  origin: 'SRD-5.1' | 'USER_IMPORT';
}

export interface CompendiumJournal {
  id: string;
  title: string;
  category: string;
  content: string;
  tags?: string[];
  sourceBook: string;
  packageId: string;
  createdAt: number;
}

export interface CompendiumRule {
  id: string;
  title: string;
  category: string;
  slug: string;
  content: string;
  tags?: string[];
  sourceBook?: string;
  packageId?: string;
  origin?: 'SRD-5.1' | 'USER_IMPORT';
}

// ── Pure 5e SRD 5.1 Seed Records ─────────────────────────────────────────────

const SRD_SPELLS: CompendiumSpell[] = [
  {
    id: 'srd-spell-cure-wounds',
    name: 'Cure Wounds',
    level: 1,
    school: 'Evocation',
    parentClass: ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'],
    castingTime: '1 action',
    range: 'Touch',
    components: 'V, S',
    duration: 'Instantaneous',
    description: 'A creature you touch regains hit points equal to 1d8 + your spellcasting ability modifier.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-spell-fireball',
    name: 'Fireball',
    level: 3,
    school: 'Evocation',
    parentClass: ['Sorcerer', 'Wizard'],
    castingTime: '1 action',
    range: '150 feet',
    components: 'V, S, M (a tiny ball of bat guano and sulfur)',
    duration: 'Instantaneous',
    description: 'A bright streak flashes from your pointing finger to a point within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere must make a DEX save, taking 8d6 fire damage on failure, or half on success.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-spell-magic-missile',
    name: 'Magic Missile',
    level: 1,
    school: 'Evocation',
    parentClass: ['Sorcerer', 'Wizard'],
    castingTime: '1 action',
    range: '120 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    description: 'You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range, dealing 1d4 + 1 force damage.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-spell-shield',
    name: 'Shield',
    level: 1,
    school: 'Abjuration',
    parentClass: ['Sorcerer', 'Wizard'],
    castingTime: '1 reaction',
    range: 'Self',
    components: 'V, S',
    duration: '1 round',
    description: 'An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-spell-bless',
    name: 'Bless',
    level: 1,
    school: 'Enchantment',
    parentClass: ['Cleric', 'Paladin'],
    castingTime: '1 action',
    range: '30 feet',
    components: 'V, S, M (a sprinkling of holy water)',
    duration: 'Concentration, up to 1 minute',
    description: 'You bless up to three creatures of your choice within range. Whenever a target makes an attack roll or a saving throw, they can add a d4 to the result.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-spell-eldritch-blast',
    name: 'Eldritch Blast',
    level: 0,
    school: 'Evocation',
    parentClass: ['Warlock'],
    castingTime: '1 action',
    range: '120 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    description: 'A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack. On a hit, the target takes 1d10 force damage.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-spell-hunters-mark',
    name: "Hunter's Mark",
    level: 1,
    school: 'Divination',
    parentClass: ['Ranger'],
    castingTime: '1 bonus action',
    range: '90 feet',
    components: 'V',
    duration: 'Concentration, up to 1 hour',
    description: 'You choose a creature you can see within range and mystically mark it as your quarry. Deal an extra 1d6 damage to the target whenever you hit it with a weapon attack.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-spell-guiding-bolt',
    name: 'Guiding Bolt',
    level: 1,
    school: 'Evocation',
    parentClass: ['Cleric'],
    castingTime: '1 action',
    range: '120 feet',
    components: 'V, S',
    duration: '1 round',
    description: 'A flash of light streaks toward a creature of your choice within range. Make a ranged spell attack. On a hit, the target takes 4d6 radiant damage, and the next attack roll made against this target before the end of your next turn has advantage.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  }
];

const SRD_SUBCLASSES: CompendiumSubclass[] = [
  {
    id: 'srd-subclass-champion',
    parentClass: 'Fighter',
    name: 'Champion',
    featuresByLevel: {
      3: ['Improved Critical'],
      7: ['Remarkable Athlete'],
      10: ['Additional Fighting Style'],
      15: ['Superior Critical'],
      18: ['Survivor']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-evocation',
    parentClass: 'Wizard',
    name: 'School of Evocation',
    featuresByLevel: {
      2: ['Evocation Savant', 'Sculpt Spells'],
      6: ['Potent Cantrip'],
      10: ['Empowered Evocation'],
      14: ['Overchannel']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-life-domain',
    parentClass: 'Cleric',
    name: 'Life Domain',
    featuresByLevel: {
      1: ['Bonus Proficiency (Heavy Armor)', 'Disciple of Life'],
      2: ['Channel Divinity: Preserve Life'],
      6: ['Blessed Healer'],
      8: ['Divine Strike'],
      17: ['Supreme Healing']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-thief',
    parentClass: 'Rogue',
    name: 'Thief',
    featuresByLevel: {
      3: ['Fast Hands', 'Second-Story Work'],
      9: ['Supreme Sneak'],
      13: ['Use Magic Device'],
      17: ["Thief's Reflexes"]
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-berserker',
    parentClass: 'Barbarian',
    name: 'Path of the Berserker',
    featuresByLevel: {
      3: ['Frenzy'],
      6: ['Mindless Rage'],
      10: ['Intimidating Presence'],
      14: ['Retaliation']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-lore',
    parentClass: 'Bard',
    name: 'College of Lore',
    featuresByLevel: {
      3: ['Bonus Proficiencies', 'Cutting Words'],
      6: ['Additional Magical Secrets'],
      14: ['Peerless Skill']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-land',
    parentClass: 'Druid',
    name: 'Circle of the Land',
    featuresByLevel: {
      2: ['Bonus Cantrip', 'Natural Recovery'],
      3: ['Circle Spells'],
      6: ["Land's Stride"],
      10: ["Nature's Ward"],
      14: ["Nature's Sanctuary"]
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-open-hand',
    parentClass: 'Monk',
    name: 'Way of the Open Hand',
    featuresByLevel: {
      3: ['Open Hand Technique'],
      6: ['Wholeness of Body'],
      11: ['Tranquility'],
      17: ['Quivering Palm']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-devotion',
    parentClass: 'Paladin',
    name: 'Oath of Devotion',
    featuresByLevel: {
      3: ['Channel Divinity: Sacred Weapon', 'Channel Divinity: Turn the Unholy'],
      7: ['Aura of Devotion'],
      15: ['Purity of Spirit'],
      20: ['Holy Nimbus']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-hunter',
    parentClass: 'Ranger',
    name: 'Hunter',
    featuresByLevel: {
      3: ["Hunter's Prey"],
      7: ['Defensive Tactics'],
      11: ['Multiattack'],
      15: ["Superior Hunter's Defense"]
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-draconic',
    parentClass: 'Sorcerer',
    name: 'Draconic Bloodline',
    featuresByLevel: {
      1: ['Dragon Ancestor', 'Draconic Resilience'],
      6: ['Elemental Affinity'],
      14: ['Dragon Wings'],
      18: ['Draconic Presence']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-subclass-fiend',
    parentClass: 'Warlock',
    name: 'The Fiend',
    featuresByLevel: {
      1: ['Expanded Spell List', "Dark One's Blessing"],
      6: ["Dark One's Own Luck"],
      10: ['Fiendish Resilience'],
      14: ['Hurl Through Hell']
    },
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  }
];

const SRD_MONSTERS: CompendiumMonster[] = [
  {
    id: 'srd-monster-goblin',
    name: 'Goblin',
    cr: 0.25,
    size: 'Small',
    type: 'Humanoid (goblinoid)',
    alignment: 'Neutral Evil',
    ac: 15,
    hp: 7,
    speed: '30 ft.',
    str: 8,
    dex: 14,
    con: 10,
    int: 10,
    wis: 8,
    cha: 8,
    actions: [
      { name: 'Scimitar', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 1d6 + 2 slashing damage.' },
      { name: 'Shortbow', description: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 1d6 + 2 piercing damage.' }
    ],
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-monster-skeleton',
    name: 'Skeleton',
    cr: 0.25,
    size: 'Medium',
    type: 'Undead',
    alignment: 'Lawful Evil',
    ac: 13,
    hp: 13,
    speed: '30 ft.',
    str: 10,
    dex: 14,
    con: 15,
    int: 6,
    wis: 8,
    cha: 5,
    actions: [
      { name: 'Shortsword', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 1d6 + 2 piercing damage.' },
      { name: 'Shortbow', description: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 1d6 + 2 piercing damage.' }
    ],
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-monster-zombie',
    name: 'Zombie',
    cr: 0.25,
    size: 'Medium',
    type: 'Undead',
    alignment: 'Neutral Evil',
    ac: 8,
    hp: 22,
    speed: '20 ft.',
    str: 13,
    dex: 6,
    con: 16,
    int: 3,
    wis: 6,
    cha: 5,
    actions: [
      { name: 'Slam', description: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 1d6 + 1 bludgeoning damage.' }
    ],
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-monster-ogre',
    name: 'Ogre',
    cr: 2,
    size: 'Large',
    type: 'Giant',
    alignment: 'Chaotic Evil',
    ac: 11,
    hp: 59,
    speed: '40 ft.',
    str: 19,
    dex: 8,
    con: 16,
    int: 5,
    wis: 7,
    cha: 7,
    actions: [
      { name: 'Greatclub', description: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 2d8 + 4 bludgeoning damage.' },
      { name: 'Javelin', description: 'Ranged Weapon Attack: +6 to hit, range 30/120 ft., one target. Hit: 2d6 + 4 piercing damage.' }
    ],
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  }
];

const SRD_FACILITIES: CompendiumFacility[] = [
  {
    id: 'srd-facility-barracks',
    name: 'Barracks & Guardhouse',
    category: 'Military',
    goldCost: 1000,
    buildDays: 30,
    benefits: 'Houses up to 20 guards and garrison hirelings. Enhances stronghold defense rating by +2.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-facility-library',
    name: 'Arcane Scriptorium & Library',
    category: 'Arcane',
    goldCost: 2000,
    buildDays: 45,
    benefits: 'Grants advantage on Arcana, History, and Religion downtime research checks. Allows copying 1 spell scroll per week.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-facility-workshop',
    name: 'Artisan Smithy & Workshop',
    category: 'Crafting',
    goldCost: 1500,
    buildDays: 35,
    benefits: 'Reduces equipment crafting and weapon repair downtime by 50%. Halves raw material costs.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  },
  {
    id: 'srd-facility-trading-post',
    name: 'Merchant Vault & Trading Post',
    category: 'Commerce',
    goldCost: 1800,
    buildDays: 40,
    benefits: 'Generates 50 GP monthly revenue and provides access to regional rare trade goods.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1'
  }
];

export const SRD_RULES: CompendiumRule[] = [
  {
    id: 'srd-rule-combat-order',
    title: 'Order of Combat',
    category: 'Combat',
    slug: 'order-of-combat',
    content: 'A typical combat encounter involves a clash between two sides. The game organizes combat into rounds and turns. A round represents about 6 seconds in the game world.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1',
  },
  {
    id: 'srd-rule-advantage-disadvantage',
    title: 'Advantage and Disadvantage',
    category: 'Core Rules',
    slug: 'advantage-and-disadvantage',
    content: 'When you have either advantage or disadvantage and something in the game lets you reroll or replace the d20, you can reroll or replace only one of the dice.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1',
  },
  {
    id: 'srd-rule-spellcasting-concentration',
    title: 'Concentration',
    category: 'Spellcasting',
    slug: 'concentration',
    content: 'Some spells require you to maintain concentration in order to keep their magic active. If you lose concentration, such a spell ends. Taking damage or being incapacitated forces a Constitution saving throw (DC 10 or half damage taken).',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1',
  },
  {
    id: 'srd-rule-death-saving-throws',
    title: 'Death Saving Throws',
    category: 'Combat',
    slug: 'death-saving-throws',
    content: 'Whenever you start your turn with 0 hit points, you must make a special saving throw, called a death saving throw, to determine whether you creep closer to death or hang onto life.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1',
  },
  {
    id: 'srd-rule-conditions',
    title: 'Conditions',
    category: 'Rules Reference',
    slug: 'conditions',
    content: 'Conditions alter a creature’s capabilities in a variety of ways and can arise as a result of a spell, a class feature, a monster’s attack, or other effect.',
    sourceBook: '5e SRD 5.1',
    packageId: 'srd-5.1',
    origin: 'SRD-5.1',
  }
];

export interface CampaignFlag {
  key: string;
  value: any;
}

export class CompendiumDatabase extends Dexie {
  spells!: Table<CompendiumSpell, string>;
  subclasses!: Table<CompendiumSubclass, string>;
  monsters!: Table<CompendiumMonster, string>;
  facilities!: Table<CompendiumFacility, string>;
  media!: Table<CompendiumMedia, string>;
  ingestedTables!: Table<IngestedTable, number>;
  campaignFlags!: Table<CampaignFlag, string>;
  items!: Table<CompendiumItem, string>;
  journal!: Table<CompendiumJournal, string>;
  rules!: Table<CompendiumRule, string>;

  constructor() {
    super('vtt_compendium_database');

    this.version(1).stores({
      spells: 'id, name, level, school, *parentClass, sourceBook, packageId, origin',
      subclasses: 'id, parentClass, name, sourceBook, packageId, origin',
      monsters: 'id, name, cr, sourceBook, packageId, origin',
      facilities: 'id, name, category, sourceBook, packageId, origin',
      media: 'id, name, sourceBook, mimeType, createdAt'
    });

    this.version(2).stores({
      ingestedTables: '++id, name, category, source'
    });

    this.version(3).stores({
      campaignFlags: 'key'
    });

    this.version(4).stores({
      items: 'id, name, type, rarity, sourceBook, packageId, origin',
      journal: 'id, title, category, sourceBook, packageId, createdAt'
    });

    this.version(5).stores({
      spells: 'id, name, level, school, casting_time, castingTime, range, concentration, ritual, *parentClass, packageId, origin, [school+level], [level+name]',
      monsters: 'id, name, cr, size, type, alignment, ac, hp, packageId, origin, [type+cr], [cr+name]',
      items: 'id, name, type, rarity, cost, weight, packageId, origin, [type+rarity]',
      rules: 'id, title, category, slug, origin, packageId, [category+title]',
    });

    this.on('populate', () => {
      this.spells.bulkAdd(SRD_SPELLS);
      this.subclasses.bulkAdd(SRD_SUBCLASSES);
      this.monsters.bulkAdd(SRD_MONSTERS);
      this.facilities.bulkAdd(SRD_FACILITIES);
      this.rules.bulkAdd(SRD_RULES);
    });
  }

  /**
   * Safely purges an imported package without touching core 5e SRD records (Fault 5).
   */
  async purgePackage(packageId: string): Promise<{
    deletedSpells: number;
    deletedSubclasses: number;
    deletedMonsters: number;
    deletedFacilities: number;
    deletedItems: number;
    deletedJournal: number;
    deletedRules: number;
  }> {
    if (packageId === 'srd-5.1') {
      throw new Error('Cannot purge protected core SRD 5.1 baseline records.');
    }

    return await this.transaction(
      'rw',
      [this.spells, this.subclasses, this.monsters, this.facilities, this.items, this.journal, this.rules],
      async () => {
        const deletedSpells = await this.spells.where('packageId').equals(packageId).delete();
        const deletedSubclasses = await this.subclasses.where('packageId').equals(packageId).delete();
        const deletedMonsters = await this.monsters.where('packageId').equals(packageId).delete();
        const deletedFacilities = await this.facilities.where('packageId').equals(packageId).delete();
        const deletedItems = await this.items.where('packageId').equals(packageId).delete();
        const deletedJournal = await this.journal.where('packageId').equals(packageId).delete();
        const deletedRules = await this.rules.where('packageId').equals(packageId).delete();

        return {
          deletedSpells,
          deletedSubclasses,
          deletedMonsters,
          deletedFacilities,
          deletedItems,
          deletedJournal,
          deletedRules,
        };
      }
    );
  }

  /**
   * Verifies and re-seeds SRD records if the database is opened empty.
   */
  async ensureSrdBaseline(): Promise<void> {
    const spellCount = await this.spells.where('origin').equals('SRD-5.1').count();
    if (spellCount === 0) {
      const normalizedSpells = SRD_SPELLS.map((s) => ({
        ...s,
        casting_time: s.casting_time || s.castingTime,
        concentration: s.concentration ?? s.duration.toLowerCase().includes('concentration'),
        ritual: s.ritual ?? false,
      }));
      await this.spells.bulkPut(normalizedSpells);
    }

    const subclassCount = await this.subclasses.where('origin').equals('SRD-5.1').count();
    if (subclassCount === 0) {
      await this.subclasses.bulkPut(SRD_SUBCLASSES);
    }

    const monsterCount = await this.monsters.where('origin').equals('SRD-5.1').count();
    if (monsterCount === 0) {
      await this.monsters.bulkPut(SRD_MONSTERS);
    }

    const facilityCount = await this.facilities.where('origin').equals('SRD-5.1').count();
    if (facilityCount === 0) {
      await this.facilities.bulkPut(SRD_FACILITIES);
    }

    const ruleCount = await this.rules.where('origin').equals('SRD-5.1').count();
    if (ruleCount === 0) {
      await this.rules.bulkPut(SRD_RULES);
    }

    const itemCount = await this.items.count();
    if (itemCount === 0) {
      try {
        const { default: srdSeedData } = await import('../data/srdCompendiumSeed.json');
        if (srdSeedData?.items?.length) {
          const mappedItems: CompendiumItem[] = srdSeedData.items.map((it: any) => ({
            id: it.id,
            name: it.name,
            type: it.type || 'Adventuring Gear',
            rarity: it.rarity || 'Common',
            damage: it.damage,
            armorClass: it.armorClass,
            properties: it.properties,
            description: it.description || '',
            weight: it.weight,
            cost: it.cost,
            sourceBook: it.source || '5e SRD 5.1',
            packageId: 'srd-5.1',
            origin: 'SRD-5.1',
          }));
          await this.items.bulkPut(mappedItems);
        }
      } catch {
        // Fallback if dynamic import fails in certain environments
      }
    }
  }
}

export const compendiumDb = new CompendiumDatabase();

export async function ensureSrdBaseline(): Promise<void> {
  return compendiumDb.ensureSrdBaseline();
}
