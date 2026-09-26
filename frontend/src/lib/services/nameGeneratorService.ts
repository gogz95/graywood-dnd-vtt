// src/lib/services/nameGeneratorService.ts
// Offline Procedural Name & Improv Generator (Syllable / Markov Chain)
// Generates fantasy names across races (Dwarf, Elf, Human, Orc, Tiefling, Halfling)
// and establishments (Taverns, General Stores, Blacksmiths, Ships).

import { bestiaryStore, encounterStore } from '../stores/bestiaryStore.svelte';
import type { CompendiumMonster } from '../db/compendiumDb';

export type FantasyRace = 'Dwarf' | 'Elf' | 'Human' | 'Orc' | 'Tiefling' | 'Halfling';
export type EstablishmentType = 'Tavern' | 'General Store' | 'Blacksmith' | 'Ship';

interface SyllableProfile {
  prefixes: string[];
  middles: string[];
  suffixes: string[];
  surnames: {
    first: string[];
    second: string[];
  };
}

const RACE_SYLLABLES: Record<FantasyRace, SyllableProfile> = {
  Dwarf: {
    prefixes: ['Thor', 'Bal', 'Dain', 'Krag', 'Bof', 'Gim', 'Thrum', 'Hild', 'Dorn', 'Grim', 'Khel', 'Mor', 'Ror', 'Brak'],
    middles: ['in', 'ar', 'ok', 'dur', 'grim', 'kar', 'gar', 'den', 'mir', 'und', 'bor'],
    suffixes: ['son', 'or', 'ic', 'din', 'mar', 'ak', 'rak', 'rek', 'li', 'nur', 'bek'],
    surnames: {
      first: ['Iron', 'Stone', 'Copper', 'Bronze', 'Gold', 'Thunder', 'Battle', 'Forge', 'Anvil', 'Hammer', 'Boulder', 'Deep'],
      second: ['fist', 'shield', 'beard', 'helm', 'forge', 'breaker', 'axe', 'heart', 'delver', 'vein', 'pick', 'stone'],
    },
  },
  Elf: {
    prefixes: ['Ael', 'Fael', 'Cael', 'Syl', 'Val', 'Il', 'Thal', 'Lor', 'Galan', 'Eren', 'Fen', 'Li', 'Quel', 'Shal'],
    middles: ['an', 'dril', 'ian', 'or', 'iel', 'thir', 'wen', 'lor', 'en', 'ria', 'vyn', 'al'],
    suffixes: ['is', 'or', 'as', 'el', 'on', 'ra', 'eth', 'wyn', 'ion', 'iel', 'ath', 'oril'],
    surnames: {
      first: ['Moon', 'Star', 'Silver', 'Sun', 'Willow', 'Night', 'Autumn', 'Breeze', 'Dawn', 'River', 'Shadow', 'Whisper'],
      second: ['whisper', 'shade', 'leaf', 'flower', 'wind', 'bow', 'dew', 'song', 'weaver', 'dancer', 'glade', 'branch'],
    },
  },
  Human: {
    prefixes: ['Ed', 'Ald', 'Rob', 'Rich', 'Will', 'Thom', 'Har', 'Geo', 'Jon', 'Wal', 'Mar', 'Bar', 'Gar', 'Hen'],
    middles: ['ward', 'win', 'er', 'ard', 'ic', 'al', 'en', 'ton', 'lan', 'ric', 'mond', 'fred'],
    suffixes: ['en', 'ton', 'ley', 'son', 'field', 'ford', 'man', 'well', 'ing', 'rick', 'ett', 'kin'],
    surnames: {
      first: ['Miller', 'Baker', 'Smith', 'Fletcher', 'Carter', 'Cooper', 'Tanner', 'Mason', 'Weaver', 'Shepherd', 'Fisher', 'Ward'],
      second: [''],
    },
  },
  Orc: {
    prefixes: ['Grak', 'Thok', 'Morg', 'Urg', 'Durg', 'Rok', 'Krag', 'Zug', 'Brag', 'Ghor', 'Vrok', 'Naz', 'Skarg', 'Wrosh'],
    middles: ['ash', 'og', 'ar', 'uk', 'or', 'gash', 'ug', 'at', 'nak', 'rul', 'mog'],
    suffixes: ['nar', 'at', 'ak', 'tor', 'gath', 'ash', 'dreg', 'lok', 'kul', 'gar', 'mar'],
    surnames: {
      first: ['Skull', 'Blood', 'Bone', 'Iron', 'Gore', 'Tusk', 'War', 'Gut', 'Spine', 'Death', 'Ash', 'Fang'],
      second: ['cleaver', 'crusher', 'splitter', 'ripper', 'render', 'basher', 'howler', 'claw', 'fang', 'gouger', 'snarl'],
    },
  },
  Tiefling: {
    prefixes: ['Mal', 'Az', 'Bar', 'Mor', 'Zar', 'Kall', 'Val', 'Ili', 'Xan', 'Raz', 'Thy', 'Zeph', 'Bel', 'Dra'],
    middles: ['ik', 'ar', 'os', 'ath', 'en', 'zir', 'oth', 'al', 'dor', 'mir', 'vash', 'thor'],
    suffixes: ['us', 'is', 'or', 'iel', 'oth', 'an', 'ash', 'rak', 'khor', 'ius', 'eph', 'ael'],
    surnames: {
      first: ['Despair', 'Grief', 'Creed', 'Sorrow', 'Torment', 'Doubt', 'Fear', 'Spite', 'Wrath', 'Guile', 'Malice', 'Ruin'],
      second: [''],
    },
  },
  Halfling: {
    prefixes: ['Mer', 'Perr', 'Cor', 'Dro', 'Fal', 'Lin', 'Ros', 'Pip', 'Sam', 'Wil', 'Olo', 'Bun', 'Tob', 'Fin'],
    middles: ['in', 'do', 'co', 'an', 'el', 'der', 'by', 'ly', 'kin', 'rick', 'ton'],
    suffixes: ['by', 'dock', 'wise', 'kin', 'foot', 'ton', 'son', 'ley', 'well', 'ford', 'ard'],
    surnames: {
      first: ['Under', 'Bramble', 'Proud', 'Green', 'Puddi', 'Brandy', 'Good', 'Tea', 'Hill', 'Apple', 'Warm', 'Cozy'],
      second: ['hill', 'foot', 'buck', 'barrel', 'bottle', 'leaf', 'kettle', 'hearth', 'burrow', 'catcher', 'bottom'],
    },
  },
};

const ESTABLISHMENT_TEMPLATES: Record<EstablishmentType, { adjectives: string[]; nouns: string[] }> = {
  Tavern: {
    adjectives: ['Prancing', 'Drunken', 'Sleeping', 'Rusty', 'Golden', 'Silver', 'Blind', 'Roaring', 'Salty', 'Crying', 'Laughing', 'Weary'],
    nouns: ['Pony', 'Dragon', 'Boar', 'Flagon', 'Anchor', 'Goblin', 'Maiden', 'Stag', 'Hound', 'Badger', 'Wyvern', 'Griffon', 'Barrel', 'Tankard'],
  },
  'General Store': {
    adjectives: ['Reliable', 'Old Town', 'Grand', 'Corner', 'Wayfarer’s', 'Frontier', 'Bazaar', 'Provisions &', 'Curio &', 'Honest'],
    nouns: ['Sundries', 'Emporium', 'Trading Post', 'Exchange', 'Mercantile', 'Outpost Supplies', 'Goods', 'Supply Co.'],
  },
  Blacksmith: {
    adjectives: ['Molten', 'Heavy', 'Tempered', 'Glowing', 'Ironclad', 'Red Hot', 'Steel', 'Masterwork', 'Blazing'],
    nouns: ['Anvil', 'Hammer', 'Bellows', 'Forge', 'Foundry', 'Sparks', 'Crucible', 'Ingot', 'Armory'],
  },
  Ship: {
    adjectives: ['Sea', 'Storm', 'Golden', 'Black', 'Swift', 'Wandering', 'Dread', 'Sovereign', 'Whistling', 'Silent'],
    nouns: ['Serpent', 'Wanderer', 'Fortune', 'Gull', 'Triton', 'Leviathan', 'Horizon', 'Corsair', 'Pearl', 'Maiden', 'Kraken'],
  },
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateCharacterName(race: FantasyRace): { firstName: string; lastName: string; fullName: string } {
  const profile = RACE_SYLLABLES[race];
  const pre = pickRandom(profile.prefixes);
  const mid = Math.random() > 0.35 ? pickRandom(profile.middles) : '';
  const suf = pickRandom(profile.suffixes);
  const firstName = `${pre}${mid}${suf}`;

  let lastName = '';
  if (profile.surnames.second.length > 0 && profile.surnames.second[0] !== '') {
    lastName = `${pickRandom(profile.surnames.first)}${pickRandom(profile.surnames.second)}`;
  } else {
    lastName = pickRandom(profile.surnames.first);
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
  };
}

export function generateEstablishmentName(type: EstablishmentType): string {
  const profile = ESTABLISHMENT_TEMPLATES[type];
  const adj = pickRandom(profile.adjectives);
  const noun = pickRandom(profile.nouns);

  if (type === 'Tavern') {
    return `The ${adj} ${noun}`;
  }
  if (type === 'Ship') {
    return `The ${adj} ${noun}`;
  }
  return `${adj} ${noun}`;
}

/**
 * Creates a standard 5e Commoner NPC (AC 10, HP 10, CR 0) and adds directly to the active combat encounter.
 */
export function quickAddNpcToRoster(name: string, race: string = 'Human'): { success: boolean; monster: CompendiumMonster } {
  const npcMonster: CompendiumMonster = {
    id: `npc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    cr: 0,
    ac: 10,
    hp: 10,
    size: 'Medium',
    type: `Humanoid (${race.toLowerCase()})`,
    speed: '30 ft.',
    alignment: 'Neutral',
    packageId: 'improv-npcs',
    sourceBook: 'Campaign Improv Roster',
    origin: 'USER_IMPORT',
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    actions: [
      {
        name: 'Club',
        description: 'Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage.',
      },
    ],
  };

  // Add directly to active combat encounter / initiative tracker
  encounterStore.addCombatant(npcMonster);

  // Dispatch global system event for notification
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vtt:notification', {
        detail: {
          title: 'NPC Added to Roster',
          message: `Created "${name}" (AC 10, HP 10) and placed on initiative roster.`,
          type: 'success',
        },
      })
    );
  }

  return { success: true, monster: npcMonster };
}
