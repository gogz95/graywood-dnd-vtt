// src/lib/services/generators/npcGenerator.ts
// Procedural 5e SRD Non-Player Character & Statblock Synthesizer

import type {
  ActorSchema,
  NpcCulture,
  NpcArchetype,
  NpcGeneratorOptions,
  ActorAction,
  ActorTrait,
  ActorPersonality,
  ActorAttributes
} from '../../types/actor';
import type { Character, AbilityName, AbilityScoreData, SkillEntry } from '../../types/character';
import type { CompendiumMonster } from '../../db/compendiumDb';
import { compendiumDb } from '../../db/compendiumDb';
import { characterStore } from '../../../stores/characterStore';
import { canvasStore, type CanvasToken } from '../../../stores/canvasStore.svelte';
import { generateName } from './markovNameGen';

// ── Persona & Flavor Datasets (5e SRD / OpenDnD Personae Pattern) ───────────

const TRAITS: Record<NpcArchetype, string[]> = {
  Guard: [
    'Speaks in a brisk, authoritative cadence and constantly watches exits.',
    'Stoic and unflinching, rarely smiling even at good jokes.',
    'Always polishing a piece of armor or inspecting their weapon edge.',
    'Believes standard procedure solves every tactical dispute.'
  ],
  Mage: [
    'Prone to muttering arcane syllabics under their breath when thinking.',
    'Treats ordinary phenomena as intricate mathematical theorems.',
    'Constantly brushes illusory sparks or dust from scholarly robes.',
    'Condescending toward brute physical force over intellectual prowess.'
  ],
  Priest: [
    'Speaks in soothing, rhythmic cadences laden with devotional proverbs.',
    'Listens attentively to grievances with unfaltering patience.',
    'Constantly traces subtle holy sigils over their chest in times of doubt.',
    'Views every worldly event as part of a grand divine providence.'
  ],
  Bandit: [
    'Fidgety and quick to reach for a hidden blade at loud noises.',
    'Grins crookedly when assessing the value of someone else’s gear.',
    'Speaks in gutter-slang peppered with thieves’ cant double meanings.',
    'Prefers the shadows of doorways and never sits with their back to a crowd.'
  ],
  Noble: [
    'Carries themselves with immaculate poise, expecting instant deference.',
    'Speaks with refined diction and an icy, measured tone.',
    'Gauges social rank immediately before deciding whether to engage.',
    'Impeccably groomed, offended by coarse language or common grime.'
  ]
};

const IDEALS: Record<NpcArchetype, string[]> = {
  Guard: [
    'Responsibility. Common folk must be safeguarded from lawless predation.',
    'Discipline. The realm survives only when each sentinel holds their post.',
    'Honor. A vow sworn to the realm is unbroken unto final breath.'
  ],
  Mage: [
    'Knowledge. True power belongs to those who understand the cosmos.',
    'Logic. Emotional whims must never compromise sound rational judgment.',
    'Innovation. Magic is meant to be unlocked, refined, and mastered.'
  ],
  Priest: [
    'Compassion. The wounded and destitute must find solace in our sanctum.',
    'Faith. Unswerving devotion will pierce through even demonic darkness.',
    'Sacrifice. Giving of oneself elevates the spirit above mortal frailty.'
  ],
  Bandit: [
    'Freedom. Chains and taxes belong to sheep; the open road is mine.',
    'Survival. You take what you can hold, or starve in the gutter.',
    'Loyalty. Betray the crew and your life is forfeit.'
  ],
  Noble: [
    'Legacy. The glory and prestige of my bloodline must outlive centuries.',
    'Duty. Those born into privilege owe stewardship over the realm.',
    'Authority. True leadership demands absolute, unyielding commands.'
  ]
};

const BONDS: Record<NpcArchetype, string[]> = {
  Guard: [
    'My company comrades are the only family I have left.',
    'I owe my life to the city commander who spared me from the gallows.',
    'I will defend the local quarter against all smugglers and thieves.'
  ],
  Mage: [
    'My arcane grimoire contains ciphered secrets of an ancient planar rift.',
    'I seek vengeance against the rogue enchanter who destroyed our academy.',
    'My master sacrificed everything to teach me; I will prove worthy.'
  ],
  Priest: [
    'The relic shrine in our sanctum must never fall into defiled hands.',
    'I work tirelessly to ease the suffering of the plague-stricken district.',
    'My deity answered my call in childhood; I am bound to their altar.'
  ],
  Bandit: [
    'I stash a portion of every haul for my kin hidden across the border.',
    'I hold a blood debt against the local magistrate who hanged my sibling.',
    'The crew captain pulled me from the slums; I never turn on them.'
  ],
  Noble: [
    'Our ancestral estate must be reclaimed from rival merchant creditors.',
    'My signet ring represents five hundred years of unblemished pedigree.',
    'My first loyalty is to the crown, above even personal safety.'
  ]
};

const FLAWS: Record<NpcArchetype, string[]> = {
  Guard: [
    'Blindly obeys orders from superior officers, even when dubious.',
    'Quick to draw steel when an outsider questions my authority.',
    'Secretly accepts coin purses to look the other way after sunset.'
  ],
  Mage: [
    'Dangerously curious about forbidden spells and necrotic curiosities.',
    'Looks down on martial combatants as expendable pawns.',
    'Paranoid that other arcanists are scheming to steal my research.'
  ],
  Priest: [
    'Dogmatic to a fault; considers non-believers fundamentally flawed.',
    'Struggles with secret spiritual doubts during solitary prayer.',
    'Overly forgiving toward unrepentant sinners who exploit my mercy.'
  ],
  Bandit: [
    'Cannot resist the temptation of an unguarded, shiny coin purse.',
    'Cowardly when facing spellcasters or superior numbers.',
    'Addicted to high-stakes gambling and alehouse wagers.'
  ],
  Noble: [
    'Arrogant and contemptuous toward common laborers and peasantry.',
    'Paralyzed by fear of public embarrassment or social disgrace.',
    'Spends extravagantly on frivolous luxuries despite mounting debts.'
  ]
};

const OCCUPATIONS: Record<NpcArchetype, string[]> = {
  Guard: ['City Watchman', 'Gate Sentry', 'Caravan Escort', 'Castle Custodian'],
  Mage: ['Arcane Scholar', 'Court Astrologer', 'Alchemical Researcher', 'War Wizard'],
  Priest: ['Temple Curate', 'Battle Chaplin', 'Wandering Friar', 'Cathedral Prelate'],
  Bandit: ['Highway Scout', 'Smuggler Cutpurse', 'Outlaw Raider', 'Mercenary Thug'],
  Noble: ['Estate Heir', 'Merchant Guildmaster', 'Crown Emissary', 'Landed Knight']
};

const PHYSICAL_APPEARANCE_TRAITS = [
  'Lean frame with sun-weathered features, wearing practical iron-studded gear.',
  'Stout and broad-shouldered with a prominent scar across the brow and sharp grey eyes.',
  'Slender and poised with raven hair pulled into a tight braid, dressed in trimmed wool.',
  'Towering build with calloused hands, carrying the distinct scent of forge soot and pine.',
  'Wiry and nimble with quick, restless amber eyes and high leather traveling boots.',
  'Dignified posture with silvered temples and deep-set eyes that miss nothing in the room.'
];

const ARCHETYPE_COLORS: Record<NpcArchetype, string> = {
  Guard: '#3b82f6',
  Mage: '#8b5cf6',
  Priest: '#eab308',
  Bandit: '#ef4444',
  Noble: '#ec4899'
};

// ── Math & Stat Scalers ───────────────────────────────────────────────────────

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function lcgRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateNpc(options: NpcGeneratorOptions = {}): ActorSchema {
  const rng = options.seed !== undefined ? lcgRandom(options.seed) : Math.random;

  const validArchetypes: NpcArchetype[] = ['Guard', 'Mage', 'Priest', 'Bandit', 'Noble'];
  const archetype: NpcArchetype =
    options.archetype && validArchetypes.includes(options.archetype as NpcArchetype)
      ? (options.archetype as NpcArchetype)
      : validArchetypes[Math.floor(rng() * validArchetypes.length)];

  const culture: NpcCulture = (options.culture as NpcCulture) || 'common';
  const cr = options.cr !== undefined ? Math.max(0, Math.min(5, options.cr)) : 1;

  const name =
    options.name ||
    generateName(culture, options.minLen || 4, options.maxLen || 12, rng);

  // Challenge Rating 0 to 5 Baseline Scaling (5e SRD 5.1 System)
  const profBonus = cr >= 5 ? 3 : 2;

  // Base attributes tailored by archetype
  let str = 10;
  let dex = 10;
  let con = 10;
  let int = 10;
  let wis = 10;
  let cha = 10;

  switch (archetype) {
    case 'Guard':
      str = 14 + Math.floor(cr * 0.8);
      dex = 12;
      con = 13 + Math.floor(cr * 0.6);
      int = 10;
      wis = 11;
      cha = 10;
      break;
    case 'Mage':
      str = 9;
      dex = 13 + Math.floor(cr * 0.4);
      con = 12 + Math.floor(cr * 0.6);
      int = 14 + Math.floor(cr * 1.0);
      wis = 12;
      cha = 11;
      break;
    case 'Priest':
      str = 12;
      dex = 10;
      con = 13 + Math.floor(cr * 0.6);
      int = 11;
      wis = 14 + Math.floor(cr * 1.0);
      cha = 13;
      break;
    case 'Bandit':
      str = 11;
      dex = 14 + Math.floor(cr * 0.9);
      con = 12 + Math.floor(cr * 0.6);
      int = 10;
      wis = 11;
      cha = 12;
      break;
    case 'Noble':
      str = 11;
      dex = 12;
      con = 11 + Math.floor(cr * 0.5);
      int = 12 + Math.floor(cr * 0.4);
      wis = 13;
      cha = 15 + Math.floor(cr * 0.8);
      break;
  }

  const attributes: ActorAttributes = {
    str: { score: str, modifier: mod(str) },
    dex: { score: dex, modifier: mod(dex) },
    con: { score: con, modifier: mod(con) },
    int: { score: int, modifier: mod(int) },
    wis: { score: wis, modifier: mod(wis) },
    cha: { score: cha, modifier: mod(cha) }
  };

  // Armor Class & Hit Points derived from 5e SRD CR scaling
  let ac = 12;
  let hp = 10;

  if (cr === 0) {
    ac = 10 + attributes.dex.modifier;
    hp = Math.max(4, 4 + attributes.con.modifier);
  } else if (cr <= 0.25) {
    ac = archetype === 'Guard' ? 14 : 11 + attributes.dex.modifier;
    hp = Math.max(9, 11 + attributes.con.modifier * 2);
  } else if (cr <= 0.5) {
    ac = archetype === 'Guard' ? 15 : 12 + attributes.dex.modifier;
    hp = Math.max(16, 18 + attributes.con.modifier * 3);
  } else if (cr <= 1) {
    ac = archetype === 'Guard' ? 16 : 13 + attributes.dex.modifier;
    hp = Math.max(26, 32 + attributes.con.modifier * 4);
  } else if (cr <= 2) {
    ac = archetype === 'Guard' ? 16 : 13 + attributes.dex.modifier;
    hp = Math.max(45, 52 + attributes.con.modifier * 6);
  } else if (cr <= 3) {
    ac = archetype === 'Guard' ? 17 : 14 + attributes.dex.modifier;
    hp = Math.max(60, 68 + attributes.con.modifier * 8);
  } else if (cr <= 4) {
    ac = archetype === 'Guard' ? 17 : 14 + attributes.dex.modifier;
    hp = Math.max(75, 84 + attributes.con.modifier * 9);
  } else {
    // CR 5
    ac = archetype === 'Guard' ? 18 : 15 + attributes.dex.modifier;
    hp = Math.max(90, 105 + attributes.con.modifier * 11);
  }

  // Archetype Actions
  const actions: ActorAction[] = [];
  const traits: ActorTrait[] = [];

  const mainAtkBonus = (archetype === 'Bandit' ? attributes.dex.modifier : attributes.str.modifier) + profBonus;

  if (archetype === 'Guard') {
    actions.push({
      name: 'Spear',
      description: `Melee or Ranged Weapon Attack: +${mainAtkBonus} to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 1d6 + ${attributes.str.modifier} piercing damage (or 1d8 + ${attributes.str.modifier} versatile).`,
      attackBonus: mainAtkBonus,
      damage: `1d6+${attributes.str.modifier}`
    });
    if (cr >= 2) {
      actions.push({
        name: 'Multiattack',
        description: 'The guard makes two melee attacks.'
      });
    }
    traits.push({
      name: 'Shield Wall',
      description: 'The guard has advantage on saving throws against being knocked prone or frightened while adjacent to an ally.'
    });
  } else if (archetype === 'Mage') {
    const spellAtk = attributes.int.modifier + profBonus;
    actions.push({
      name: 'Fire Bolt',
      description: `Ranged Spell Attack: +${spellAtk} to hit, range 120 ft., one target. Hit: ${cr >= 5 ? '2d10' : '1d10'} fire damage.`,
      attackBonus: spellAtk,
      damage: cr >= 5 ? '2d10' : '1d10'
    });
    actions.push({
      name: 'Magic Missile (1st Level)',
      description: 'Creates three glowing darts of magical force. Each dart deals 1d4 + 1 force damage to a creature within 120 ft.'
    });
    if (cr >= 3) {
      actions.push({
        name: 'Fireball (3rd Level)',
        description: `Each creature in a 20-foot-radius sphere must make a DC ${8 + spellAtk} Dexterity saving throw, taking 8d6 fire damage on a failed save.`
      });
    }
  } else if (archetype === 'Priest') {
    const wisAtk = attributes.wis.modifier + profBonus;
    actions.push({
      name: 'Mace',
      description: `Melee Weapon Attack: +${attributes.str.modifier + profBonus} to hit, reach 5 ft., one target. Hit: 1d6 + ${attributes.str.modifier} bludgeoning damage.`,
      attackBonus: attributes.str.modifier + profBonus,
      damage: `1d6+${attributes.str.modifier}`
    });
    actions.push({
      name: 'Sacred Flame',
      description: `Flame-like radiance descends on a creature within 60 ft. Target must succeed on a DC ${8 + wisAtk} Dexterity saving throw or take ${cr >= 5 ? '2d8' : '1d8'} radiant damage.`
    });
    actions.push({
      name: 'Cure Wounds (1st Level)',
      description: `A creature touched regains 1d8 + ${attributes.wis.modifier} hit points.`
    });
  } else if (archetype === 'Bandit') {
    actions.push({
      name: 'Scimitar',
      description: `Melee Weapon Attack: +${attributes.dex.modifier + profBonus} to hit, reach 5 ft., one target. Hit: 1d6 + ${attributes.dex.modifier} slashing damage.`,
      attackBonus: attributes.dex.modifier + profBonus,
      damage: `1d6+${attributes.dex.modifier}`
    });
    actions.push({
      name: 'Light Crossbow',
      description: `Ranged Weapon Attack: +${attributes.dex.modifier + profBonus} to hit, range 80/320 ft., one target. Hit: 1d8 + ${attributes.dex.modifier} piercing damage.`,
      attackBonus: attributes.dex.modifier + profBonus,
      damage: `1d8+${attributes.dex.modifier}`
    });
    if (cr >= 2) {
      actions.push({
        name: 'Sneak Attack',
        description: 'Deals an extra 2d6 damage to one creature hit with a weapon attack if the bandit has advantage.'
      });
    }
  } else {
    // Noble
    actions.push({
      name: 'Rapier',
      description: `Melee Weapon Attack: +${attributes.dex.modifier + profBonus} to hit, reach 5 ft., one target. Hit: 1d8 + ${attributes.dex.modifier} piercing damage.`,
      attackBonus: attributes.dex.modifier + profBonus,
      damage: `1d8+${attributes.dex.modifier}`
    });
    actions.push({
      name: 'Parry (Reaction)',
      description: 'The noble adds +2 to its AC against one melee attack that would hit it.'
    });
    traits.push({
      name: 'Commanding Presence',
      description: 'Allies within 30 feet that can see and hear the noble gain +1 on weapon attack rolls.'
    });
  }

  // Persona Synthesis
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const personality: ActorPersonality = {
    trait: pick(TRAITS[archetype]),
    ideal: pick(IDEALS[archetype]),
    bond: pick(BONDS[archetype]),
    flaw: pick(FLAWS[archetype])
  };

  const appearance = pick(PHYSICAL_APPEARANCE_TRAITS);
  const occupation = pick(OCCUPATIONS[archetype]);

  const initials = name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || name.slice(0, 2).toUpperCase();

  return {
    id: `npc-${Date.now()}-${Math.floor(rng() * 10000)}`,
    name,
    culture,
    archetype,
    cr,
    level: Math.max(1, Math.round(cr)),
    alignment: pick(['Lawful Good', 'Neutral Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Neutral Evil']),
    size: 'Medium',
    type: 'Humanoid',
    attributes,
    hp,
    maxHp: hp,
    tempHp: 0,
    ac,
    speed: 30,
    initiative: attributes.dex.modifier,
    proficiencyBonus: profBonus,
    personality,
    appearance,
    occupation,
    actions,
    traits,
    token: {
      color: ARCHETYPE_COLORS[archetype],
      initials,
      sizeInCells: 1
    },
    createdAt: Date.now()
  };
}

// ── Compendium & Store Conversion ───────────────────────────────────────────

export function actorToCompendiumMonster(actor: ActorSchema): CompendiumMonster {
  return {
    id: actor.id,
    name: actor.name,
    cr: actor.cr,
    size: actor.size,
    type: `${actor.type} (${actor.archetype})`,
    alignment: actor.alignment,
    ac: actor.ac,
    hp: actor.hp,
    speed: `${actor.speed} ft.`,
    str: actor.attributes.str.score,
    dex: actor.attributes.dex.score,
    con: actor.attributes.con.score,
    int: actor.attributes.int.score,
    wis: actor.attributes.wis.score,
    cha: actor.attributes.cha.score,
    traits: actor.traits,
    actions: actor.actions.map(a => ({ name: a.name, description: a.description })),
    sourceBook: 'Procedural 5e SRD',
    packageId: 'procedural-npc',
    origin: 'USER_IMPORT'
  };
}

export function actorToCharacter(actor: ActorSchema): Character {
  const mapAbility = (name: AbilityName, pair: { score: number; modifier: number }): AbilityScoreData => ({
    score: pair.score,
    modifier: pair.modifier,
    saveProficient: false,
    saveBonus: pair.modifier
  });

  const abilities: Record<AbilityName, AbilityScoreData> = {
    str: mapAbility('str', actor.attributes.str),
    dex: mapAbility('dex', actor.attributes.dex),
    con: mapAbility('con', actor.attributes.con),
    int: mapAbility('int', actor.attributes.int),
    wis: mapAbility('wis', actor.attributes.wis),
    cha: mapAbility('cha', actor.attributes.cha)
  };

  const skills: Record<string, SkillEntry> = {
    Athletics: { name: 'Athletics', governingAbility: 'str', tier: 'none', modifier: abilities.str.modifier },
    Stealth: { name: 'Stealth', governingAbility: 'dex', tier: 'none', modifier: abilities.dex.modifier },
    Perception: { name: 'Perception', governingAbility: 'wis', tier: 'proficient', modifier: abilities.wis.modifier + actor.proficiencyBonus },
    Insight: { name: 'Insight', governingAbility: 'wis', tier: 'none', modifier: abilities.wis.modifier },
    Persuasion: { name: 'Persuasion', governingAbility: 'cha', tier: 'none', modifier: abilities.cha.modifier }
  };

  return {
    id: actor.id,
    name: actor.name,
    playerName: 'DM (NPC)',
    race: actor.culture,
    subrace: '',
    class: actor.archetype,
    subclass: actor.occupation,
    level: actor.level,
    experience: 0,
    background: actor.occupation,
    alignment: actor.alignment,
    inspiration: false,

    currentHp: actor.hp,
    maxHp: actor.maxHp,
    tempHp: actor.tempHp,
    deathSaves: { successes: 0, failures: 0 },
    hitDice: { current: actor.level, total: actor.level, dieType: 'd8' },
    exhaustionLevel: 0,

    armorClass: actor.ac,
    initiativeBonus: actor.initiative,
    walkingSpeed: actor.speed,
    swimmingSpeed: Math.floor(actor.speed / 2),
    passivePerception: 10 + abilities.wis.modifier + actor.proficiencyBonus,
    passiveInvestigation: 10 + abilities.int.modifier,
    passiveInsight: 10 + abilities.wis.modifier,

    abilities,
    skills,
    equipmentDurability: [],
    spellcasting: {
      casterLevel: actor.level,
      spellcastingAbility: 'int',
      spellSaveDc: 8 + actor.proficiencyBonus + abilities.int.modifier,
      spellAttackBonus: actor.proficiencyBonus + abilities.int.modifier,
      slots: {
        1: { current: 2, max: 2 },
        2: { current: 0, max: 0 },
        3: { current: 0, max: 0 },
        4: { current: 0, max: 0 },
        5: { current: 0, max: 0 },
        6: { current: 0, max: 0 },
        7: { current: 0, max: 0 },
        8: { current: 0, max: 0 },
        9: { current: 0, max: 0 }
      },
      preparedSpells: actor.actions.map(a => a.name),
      knownCantrips: []
    },
    spell_slots: {
      1: { current: 2, max: 2 },
      2: { current: 0, max: 0 },
      3: { current: 0, max: 0 },
      4: { current: 0, max: 0 },
      5: { current: 0, max: 0 },
      6: { current: 0, max: 0 },
      7: { current: 0, max: 0 },
      8: { current: 0, max: 0 },
      9: { current: 0, max: 0 }
    },
    currency: { cp: 0, sp: 20, gp: 5 },
    companions: [],
    manaPotionsDrunkLongRest: 0,
    conditions: [],
    notes: `${actor.appearance}\n\nTrait: ${actor.personality.trait}\nIdeal: ${actor.personality.ideal}\nBond: ${actor.personality.bond}\nFlaw: ${actor.personality.flaw}`
  };
}

export function actorToCanvasToken(actor: ActorSchema, col = 0, row = 0): CanvasToken {
  return {
    id: actor.id,
    name: actor.name,
    x: col,
    y: row,
    color: actor.token.color,
    isPlayer: false,
    hp: actor.hp,
    maxHp: actor.maxHp,
    tempHp: actor.tempHp,
    ac: actor.ac,
    isVisible: true,
    conditions: [],
    isOrbSealed: false,
    sizeInCells: actor.token.sizeInCells || 1,
    sightRadiusFeet: 30
  };
}

// ── Store & Persistence Pipeline ────────────────────────────────────────────

export async function persistNpcToCompendium(actor: ActorSchema): Promise<void> {
  // 1. Dexie compendium database
  const monster = actorToCompendiumMonster(actor);
  try {
    await compendiumDb.monsters.put(monster);
  } catch (err) {
    console.warn('[npcGenerator] Dexie persistence error:', err);
  }

  // 2. Local characterStore update
  const character = actorToCharacter(actor);
  characterStore.set(character as any);

  // 3. Optional SQLite backend persistence via REST
  if (typeof fetch !== 'undefined') {
    try {
      await fetch('/api/campaign/monsters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actor.id,
          name: actor.name,
          cr: String(actor.cr),
          size: actor.size,
          type_str: actor.type,
          ac: actor.ac,
          hp: actor.hp,
          stats_json: JSON.stringify(actor.attributes),
          traits_json: JSON.stringify(actor.traits),
          actions_json: JSON.stringify(actor.actions),
          source: 'Procedural NPC'
        })
      });
    } catch {
      // Backend may be offline in dev/test; Dexie provides primary offline guarantee
    }
  }
}

export function spawnNpcTokenOnCanvas(actor: ActorSchema, col?: number, row?: number): CanvasToken {
  const gridSize = canvasStore.gridSize || 60;
  let targetCol = col;
  let targetRow = row;

  if (targetCol === undefined || targetRow === undefined) {
    const vp = canvasStore.dmViewport;
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Viewport formula: screenCenter = worldCoord * zoom + vp.x
    // worldCoord = (screenCenter - vp.x) / zoom
    const zoom = vp.zoom || 1.0;
    const worldCenterX = (screenW / 2 - vp.x) / zoom;
    const worldCenterY = (screenH / 2 - vp.y) / zoom;

    targetCol = Math.max(0, Math.floor(worldCenterX / gridSize));
    targetRow = Math.max(0, Math.floor(worldCenterY / gridSize));
  }

  const token = actorToCanvasToken(actor, targetCol, targetRow);
  canvasStore.addToken(token);
  return token;
}
