  // src/lib/data/starterCampaignSeed.ts
// Bundled Starter Campaign Seed ("The Sunken Crypt") for instant first-time DM launch.
// Includes 1 20x20 UVTT map with walls & doors, 4 Level 1 PCs, 3 monsters, and a compendium-linked journal note.

import type { TacticalBattlemap } from '../types/maps';
import type { CompendiumMonster, CompendiumJournal } from '../db/compendiumDb';
import type { CanvasToken } from '../../stores/canvasStore.svelte';

export interface StarterPartyMember {
  id: string;
  name: string;
  playerName: string;
  class: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  tempHp?: number;
  ac: number;
  passivePerception: number;
  pin: string;
  isOnline: boolean;
  isNpc: boolean;
  conditions: string[];
  race: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  weaponName: string;
  armorName: string;
  hitDiceCurrent: number;
  hitDiceMax: number;
}

// ── 1. The Sunken Crypt Battlemap (20x20 Grid, Walls & 2 Doors) ───────────────

export const SUNKEN_CRYPT_MAP_ID = 'map-sunken-crypt-starter';

export const SUNKEN_CRYPT_BATTLEMAP: TacticalBattlemap = {
  id: SUNKEN_CRYPT_MAP_ID,
  name: 'The Sunken Crypt',
  type: 'tactical',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  biome: 'dungeon',
  grid: {
    type: 'square',
    sizePx: 60,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.35,
    color: '#38bdf8',
  },
  lighting: {
    ambientDarkness: 0.65,
    tintColor: '#0a0f1d',
  },
  fogOfWar: {
    revealedPolygons: [
      [
        { x: 180, y: 180 },
        { x: 480, y: 180 },
        { x: 480, y: 540 },
        { x: 180, y: 540 },
      ],
    ],
    concealedPolygons: [],
  },
  // Line of sight wall segments defining the crypt perimeter & interior chambers
  walls: [
    // Outer perimeter
    { id: 'w-top', p1: { x: 120, y: 120 }, p2: { x: 1080, y: 120 }, type: 'wall' },
    { id: 'w-right', p1: { x: 1080, y: 120 }, p2: { x: 1080, y: 1080 }, type: 'wall' },
    { id: 'w-bottom', p1: { x: 1080, y: 1080 }, p2: { x: 120, y: 1080 }, type: 'wall' },
    { id: 'w-left', p1: { x: 120, y: 1080 }, p2: { x: 120, y: 120 }, type: 'wall' },
    // Dividing corridor wall left
    { id: 'w-mid-1', p1: { x: 480, y: 120 }, p2: { x: 480, y: 480 }, type: 'wall' },
    // Antechamber Door (Door 1)
    { id: 'd-antechamber', p1: { x: 480, y: 480 }, p2: { x: 480, y: 600 }, type: 'door_closed' },
    { id: 'w-mid-2', p1: { x: 480, y: 600 }, p2: { x: 480, y: 1080 }, type: 'wall' },
    // Inner Reliquary Door (Door 2)
    { id: 'd-reliquary', p1: { x: 780, y: 540 }, p2: { x: 840, y: 540 }, type: 'door_closed' },
    { id: 'w-inner-top', p1: { x: 720, y: 360 }, p2: { x: 960, y: 360 }, type: 'wall' },
    { id: 'w-inner-bot', p1: { x: 720, y: 720 }, p2: { x: 960, y: 720 }, type: 'wall' },
  ],
  tokens: [
    { tokenId: 'hero-fighter', x: 4, y: 5, elevationFt: 0, isVisibleToPlayers: true },
    { tokenId: 'hero-rogue', x: 4, y: 6, elevationFt: 0, isVisibleToPlayers: true },
    { tokenId: 'hero-cleric', x: 3, y: 5, elevationFt: 0, isVisibleToPlayers: true },
    { tokenId: 'hero-wizard', x: 3, y: 6, elevationFt: 0, isVisibleToPlayers: true },
    { tokenId: 'mob-skeleton-1', x: 11, y: 5, elevationFt: 0, isVisibleToPlayers: false },
    { tokenId: 'mob-zombie-1', x: 12, y: 7, elevationFt: 0, isVisibleToPlayers: false },
    { tokenId: 'mob-ghoul-1', x: 14, y: 6, elevationFt: 0, isVisibleToPlayers: false },
  ],
};

// ── 2. 4 Pre-generated Level 1 Player Characters ──────────────────────────────

export const STARTER_CHARACTERS: StarterPartyMember[] = [
  {
    id: 'hero-fighter',
    name: 'Kaelen Thorne',
    playerName: 'Player 1',
    class: 'Fighter',
    level: 1,
    hpCurrent: 12,
    hpMax: 12,
    tempHp: 0,
    ac: 16,
    passivePerception: 12,
    pin: '1001',
    isOnline: true,
    isNpc: false,
    conditions: [],
    race: 'Human',
    str: 16,
    dex: 13,
    con: 15,
    int: 9,
    wis: 12,
    cha: 11,
    weaponName: 'Longsword (+5 to hit, 1d8+3 slashing)',
    armorName: 'Chain Shirt & Shield',
    hitDiceCurrent: 1,
    hitDiceMax: 1,
  },
  {
    id: 'hero-rogue',
    name: 'Lyra Moonwhisper',
    playerName: 'Player 2',
    class: 'Rogue',
    level: 1,
    hpCurrent: 9,
    hpMax: 9,
    tempHp: 0,
    ac: 14,
    passivePerception: 15,
    pin: '1002',
    isOnline: true,
    isNpc: false,
    conditions: [],
    race: 'Elf',
    str: 10,
    dex: 17,
    con: 12,
    int: 14,
    wis: 13,
    cha: 12,
    weaponName: 'Shortsword & Shortbow (+5 to hit, 1d6+3 piercing + 1d6 Sneak Attack)',
    armorName: 'Leather Armor',
    hitDiceCurrent: 1,
    hitDiceMax: 1,
  },
  {
    id: 'hero-cleric',
    name: 'Brother Donald',
    playerName: 'Player 3',
    class: 'Cleric',
    level: 1,
    hpCurrent: 10,
    hpMax: 10,
    tempHp: 0,
    ac: 16,
    passivePerception: 15,
    pin: '1003',
    isOnline: true,
    isNpc: false,
    conditions: [],
    race: 'Dwarf',
    str: 14,
    dex: 10,
    con: 15,
    int: 10,
    wis: 16,
    cha: 11,
    weaponName: 'Warhammer (+4 to hit, 1d8+2 bludgeoning)',
    armorName: 'Scale Mail & Shield',
    hitDiceCurrent: 1,
    hitDiceMax: 1,
  },
  {
    id: 'hero-wizard',
    name: 'Zephyr the Astromancer',
    playerName: 'Player 4',
    class: 'Wizard',
    level: 1,
    hpCurrent: 7,
    hpMax: 7,
    tempHp: 0,
    ac: 12,
    passivePerception: 13,
    pin: '1004',
    isOnline: true,
    isNpc: false,
    conditions: [],
    race: 'Human',
    str: 8,
    dex: 14,
    con: 13,
    int: 16,
    wis: 12,
    cha: 10,
    weaponName: 'Quarterstaff & Fire Bolt (+5 to hit, 1d10 fire)',
    armorName: "Mage's Robes",
    hitDiceCurrent: 1,
    hitDiceMax: 1,
  },
];

// ── 3. 3 Monster Statblocks (Skeleton, Zombie, Crypt Ghoul) ───────────────────

export const STARTER_MONSTERS: CompendiumMonster[] = [
  {
    id: 'monster-skeleton-starter',
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
    hitDice: '2d8+4',
    senses: 'Darkvision 60 ft., passive Perception 9',
    languages: 'Understands languages known in life but cannot speak',
    traits: [
      {
        name: 'Damage Vulnerability',
        description: 'Vulnerable to bludgeoning damage.',
      },
      {
        name: 'Damage Immunities',
        description: 'Poison.',
      },
    ],
    actions: [
      {
        name: 'Shortsword',
        description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
      },
      {
        name: 'Shortbow',
        description: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
      },
    ],
    sourceBook: '5e SRD 5.1',
    packageId: 'starter-seed',
    origin: 'SRD-5.1',
  },
  {
    id: 'monster-zombie-starter',
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
    hitDice: '3d8+9',
    senses: 'Darkvision 60 ft., passive Perception 8',
    languages: 'Understands languages known in life but cannot speak',
    traits: [
      {
        name: 'Undead Fortitude',
        description:
          'If damage reduces the zombie to 0 hit points, it must make a Constitution saving throw with a DC of 5 + the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 hit point instead.',
      },
    ],
    actions: [
      {
        name: 'Slam',
        description: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.',
      },
    ],
    sourceBook: '5e SRD 5.1',
    packageId: 'starter-seed',
    origin: 'SRD-5.1',
  },
  {
    id: 'monster-ghoul-starter',
    name: 'Crypt Ghoul',
    cr: 1,
    size: 'Medium',
    type: 'Undead',
    alignment: 'Chaotic Evil',
    ac: 12,
    hp: 22,
    speed: '30 ft.',
    str: 13,
    dex: 15,
    con: 10,
    int: 7,
    wis: 10,
    cha: 6,
    hitDice: '5d8',
    senses: 'Darkvision 60 ft., passive Perception 10',
    languages: 'Common',
    traits: [
      {
        name: 'Damage Immunities',
        description: 'Poison.',
      },
      {
        name: 'Condition Immunities',
        description: 'Charmed, Exhaustion, Poisoned.',
      },
    ],
    actions: [
      {
        name: 'Bite',
        description: 'Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 9 (2d6 + 2) piercing damage.',
      },
      {
        name: 'Claws',
        description:
          'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) slashing damage. If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed for 1 minute.',
      },
    ],
    sourceBook: '5e SRD 5.1',
    packageId: 'starter-seed',
    origin: 'SRD-5.1',
  },
];

// ── 4. 1 Journal Note with Compendium Links ───────────────────────────────────

export const STARTER_JOURNAL_NOTE: CompendiumJournal = {
  id: 'journal-crypt-secrets',
  title: 'Session 0: Crypt Secrets',
  category: 'Adventure Notes',
  content: `# Session 0: Secrets of the Sunken Crypt

The village of Ostrava whispers of hollow scraping beneath the old cemetery. 

### Key Encounters & Leads
- **The Entry Hall**: Guarded by 2 ancient [[Skeleton]] sentinels clutching rusted scythes.
- **The Flooded Antechamber**: Submerged sarcophagi house a shambling [[Zombie]] caught in the brine.
- **The Sealed Reliquary**: Behind the heavy locked iron door lurks the dreaded [[Crypt Ghoul]].
- **Reward**: A hidden cache containing 150 gp, 3x [[Potion of Healing]], and a vial of alchemical brine.

### DM Tactics
- Doors are reinforced oak with iron bands (DC 13 Athletics or DC 12 Thieves' Tools).
- The water is knee-deep (difficult terrain for small creatures).
`,
  tags: ['Crypt', 'Ostrava', 'Undead', 'One-Shot'],
  sourceBook: 'Graywood Starter Seed',
  packageId: 'starter-seed',
  createdAt: Date.now(),
};

// ── 5. Canvas Starter Tokens for Tactical Mat ─────────────────────────────────

export const STARTER_CANVAS_TOKENS: CanvasToken[] = [
  {
    id: 'hero-fighter',
    name: 'Kaelen Thorne',
    x: 4,
    y: 5,
    color: '#3b82f6',
    isPlayer: true,
    hp: 12,
    maxHp: 12,
    ac: 16,
    isVisible: true,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: 1,
    sightRadiusFeet: 30,
  },
  {
    id: 'hero-rogue',
    name: 'Lyra Moonwhisper',
    x: 4,
    y: 6,
    color: '#10b981',
    isPlayer: true,
    hp: 9,
    maxHp: 9,
    ac: 14,
    isVisible: true,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: 1,
    sightRadiusFeet: 60,
  },
  {
    id: 'hero-cleric',
    name: 'Brother Donald',
    x: 3,
    y: 5,
    color: '#f59e0b',
    isPlayer: true,
    hp: 10,
    maxHp: 10,
    ac: 16,
    isVisible: true,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: 1,
    sightRadiusFeet: 60,
  },
  {
    id: 'hero-wizard',
    name: 'Zephyr',
    x: 3,
    y: 6,
    color: '#8b5cf6',
    isPlayer: true,
    hp: 7,
    maxHp: 7,
    ac: 12,
    isVisible: true,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: 1,
    sightRadiusFeet: 30,
  },
  {
    id: 'mob-skeleton-1',
    name: 'Skeleton Archer',
    x: 11,
    y: 5,
    color: '#e2e8f0',
    isPlayer: false,
    hp: 13,
    maxHp: 13,
    ac: 13,
    isVisible: false,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: 1,
    sightRadiusFeet: 60,
  },
  {
    id: 'mob-zombie-1',
    name: 'Plague Zombie',
    x: 12,
    y: 7,
    color: '#84cc16',
    isPlayer: false,
    hp: 22,
    maxHp: 22,
    ac: 8,
    isVisible: false,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: 1,
    sightRadiusFeet: 60,
  },
  {
    id: 'mob-ghoul-1',
    name: 'Crypt Ghoul',
    x: 14,
    y: 6,
    color: '#ef4444',
    isPlayer: false,
    hp: 22,
    maxHp: 22,
    ac: 12,
    isVisible: false,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: 1,
    sightRadiusFeet: 60,
  },
];
