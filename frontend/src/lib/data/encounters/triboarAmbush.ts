// frontend/src/lib/data/encounters/triboarAmbush.ts
// Pre-baked "Ambush at Triboar Trail" Encounter Blueprint (5e SRD 5.1 Baseline)
// Defines 30x20 tactical grid, goblin monster statblocks, terrain obstacles, and LOS wall colliders.

import type { WallCollider } from '../../canvas/lighting/RaycastEngine';
import type { ActivatedActor } from '../../db/dexieDb';

export interface EncounterCombatantTemplate {
  id: string;
  name: string;
  actorId: string;
  x: number; // grid column (0-indexed)
  y: number; // grid row (0-indexed)
  sizeInCells: number;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  color: string;
  isPlayer: boolean;
  isVisible: boolean; // false for DM-hidden / high-stealth ambushers
  hidden?: boolean;
  stealthCheck?: number;
  conditions: string[];
  elevation?: number;
  difficultTerrain?: boolean;
  notes?: string;
}

export interface EncounterBlueprint {
  id: string;
  title: string;
  flavorPrompt: string;
  grid: {
    cellWidthPx: number; // 70px
    cols: number;        // 30 cells (2100px)
    rows: number;        // 20 cells (1400px)
    type: 'square';
    scaleFeet: 5;
  };
  ambience: {
    preset: string;
    droneSfx: string;
    windSfx: string;
  };
  actors: ActivatedActor[];
  combatants: EncounterCombatantTemplate[];
  walls: WallCollider[];
  fogOfWar: {
    defaultExploredCenter: { x: number; y: number; radius: number };
  };
}

export const GOBLIN_SRD_ACTOR: ActivatedActor = {
  id: 'actor-goblin-srd',
  name: 'Goblin',
  type: 'monster',
  is_activated: 1,
  provenance: {
    file_rel: 'SRD-5.1.pdf',
    page: 307,
  },
  mechanics: {
    ac: 15,
    hp: 7,
    speed: '30 ft.',
    stats: {
      str: 8,
      dex: 14,
      con: 10,
      int: 10,
      wis: 8,
      cha: 8,
    },
    attack_bonus: 4,
    damage_formula: '1d6 + 2',
    cr: '1/4',
    alignment: 'Neutral Evil',
    size: 'Small',
    skills: 'Stealth +6',
    senses: 'darkvision 60 ft., passive Perception 9',
    languages: 'Common, Goblin',
    traits: [
      {
        name: 'Nimble Escape',
        desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.',
      },
    ],
    actions: [
      {
        name: 'Scimitar',
        desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
      },
      {
        name: 'Shortbow',
        desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
      },
    ],
  },
  current_hp: 7,
  max_hp: 7,
  hit_dice_current: 2,
  hit_dice_max: 2,
  hit_die_size: 6,
};

export const DEAD_HORSE_ACTOR: ActivatedActor = {
  id: 'actor-dead-horse-carcass',
  name: 'Dead Horse Carcass',
  type: 'terrain',
  is_activated: 1,
  provenance: {
    file_rel: 'SRD-5.1.pdf',
    page: 190,
  },
  mechanics: {
    ac: 10,
    hp: 20,
    speed: '0 ft.',
    cr: '0',
    notes: 'Provides half cover (+2 AC) and counts as difficult terrain (costs double movement).',
  },
  current_hp: 20,
  max_hp: 20,
};

export const TRIBOAR_AMBUSH_ENCOUNTER: EncounterBlueprint = {
  id: 'triboar_ambush',
  title: 'Ambush at Triboar Trail',
  flavorPrompt:
    'Two dead horses lie gutted in the dirt road ahead, arrows protruding from their ribs. Steep briar thickets line the high embankments.',
  grid: {
    cellWidthPx: 70,
    cols: 30, // 2100px total
    rows: 20, // 1400px total
    type: 'square',
    scaleFeet: 5,
  },
  ambience: {
    preset: 'Forest Ambush',
    droneSfx: 'sfx-drone',
    windSfx: 'sfx-wind',
  },
  actors: [GOBLIN_SRD_ACTOR, DEAD_HORSE_ACTOR],
  combatants: [
    // 2 Dead Horses ($2 \times 1$ large carcass tokens on the road)
    {
      id: 'tok-dead-horse-1',
      name: 'Dead Riding Horse (North)',
      actorId: 'actor-dead-horse-carcass',
      x: 14,
      y: 9,
      sizeInCells: 2,
      hp: 20,
      maxHp: 20,
      ac: 10,
      speed: 0,
      color: '#78350f',
      isPlayer: false,
      isVisible: true,
      conditions: ['Prone'],
      difficultTerrain: true,
      notes: 'Gutted black riding horse. Arrows with black fletching.',
    },
    {
      id: 'tok-dead-horse-2',
      name: 'Dead Draft Horse (South)',
      actorId: 'actor-dead-horse-carcass',
      x: 16,
      y: 11,
      sizeInCells: 2,
      hp: 20,
      maxHp: 20,
      ac: 10,
      speed: 0,
      color: '#78350f',
      isPlayer: false,
      isVisible: true,
      conditions: ['Prone'],
      difficultTerrain: true,
      notes: 'Looted saddlebags; empty map case lying nearby.',
    },

    // 2 Goblins in visible brush flanks
    {
      id: 'tok-goblin-brush-1',
      name: 'Goblin Scout (South Thicket)',
      actorId: 'actor-goblin-srd',
      x: 12,
      y: 15,
      sizeInCells: 1,
      hp: 7,
      maxHp: 7,
      ac: 15,
      speed: 30,
      color: '#dc2626',
      isPlayer: false,
      isVisible: true,
      hidden: false,
      conditions: [],
      notes: 'Armed with shortbow and scimitar, crouching behind low scrub.',
    },
    {
      id: 'tok-goblin-brush-2',
      name: 'Goblin Scout (East Trail)',
      actorId: 'actor-goblin-srd',
      x: 21,
      y: 10,
      sizeInCells: 1,
      hp: 7,
      maxHp: 7,
      ac: 15,
      speed: 30,
      color: '#dc2626',
      isPlayer: false,
      isVisible: true,
      hidden: false,
      conditions: [],
      notes: 'Waiting for fleeing targets at the road curve.',
    },

    // 2 Goblins hidden on the high northern ridge (Stealth check 16)
    {
      id: 'tok-goblin-ridge-1',
      name: 'Goblin Sniper (North Ridge)',
      actorId: 'actor-goblin-srd',
      x: 13,
      y: 3,
      sizeInCells: 1,
      hp: 7,
      maxHp: 7,
      ac: 15,
      speed: 30,
      color: '#dc2626',
      isPlayer: false,
      isVisible: false, // Hidden from player screen
      hidden: true,
      stealthCheck: 16,
      elevation: 10, // 10ft embankment
      conditions: ['Invisible'],
      notes: 'Concealed in thick briars with drawn shortbow (Passive Perception DC 16 to spot).',
    },
    {
      id: 'tok-goblin-ridge-2',
      name: 'Goblin Ambusher (North Ridge East)',
      actorId: 'actor-goblin-srd',
      x: 17,
      y: 4,
      sizeInCells: 1,
      hp: 7,
      maxHp: 7,
      ac: 15,
      speed: 30,
      color: '#dc2626',
      isPlayer: false,
      isVisible: false, // Hidden from player screen
      hidden: true,
      stealthCheck: 16,
      elevation: 10,
      conditions: ['Invisible'],
      notes: 'Holding action to fire arrow upon party entering killzone.',
    },
  ],

  // Thick Briar Walls: Line segments blocking Line-of-Sight and raycast vision along embankments
  walls: [
    // North embankment briar line (x: 420px to 1680px, y: ~350px)
    {
      id: 'wall-briar-north-1',
      p1: { x: 420, y: 350 },
      p2: { x: 910, y: 350 },
      sense: 'block',
      move: 'block',
    },
    {
      id: 'wall-briar-north-2',
      p1: { x: 910, y: 350 },
      p2: { x: 1400, y: 350 },
      sense: 'block',
      move: 'block',
    },
    {
      id: 'wall-briar-north-3',
      p1: { x: 1400, y: 350 },
      p2: { x: 1890, y: 350 },
      sense: 'block',
      move: 'block',
    },

    // South embankment briar thicket (x: 560px to 1750px, y: ~1050px)
    {
      id: 'wall-briar-south-1',
      p1: { x: 560, y: 1050 },
      p2: { x: 1050, y: 1050 },
      sense: 'block',
      move: 'block',
    },
    {
      id: 'wall-briar-south-2',
      p1: { x: 1050, y: 1050 },
      p2: { x: 1540, y: 1050 },
      sense: 'block',
      move: 'block',
    },
    {
      id: 'wall-briar-south-3',
      p1: { x: 1540, y: 1050 },
      p2: { x: 1820, y: 1190 },
      sense: 'block',
      move: 'block',
    },

    // Dead horse carcass obstacles (cover blocks)
    {
      id: 'wall-horse-cover-1',
      p1: { x: 980, y: 630 },
      p2: { x: 1120, y: 630 },
      sense: 'pass',
      move: 'block',
    },
    {
      id: 'wall-horse-cover-2',
      p1: { x: 1120, y: 770 },
      p2: { x: 1260, y: 770 },
      sense: 'pass',
      move: 'block',
    },
  ],

  fogOfWar: {
    defaultExploredCenter: {
      x: 10,
      y: 10,
      radius: 6,
    },
  },
};
