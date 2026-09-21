// src/lib/services/classQuizEngine.ts
// 10-Question 5e SRD Guided Quiz Engine & Procedural Archetype Generator

import { SRD_BACKGROUNDS, type SrdBackground } from '../data/srdBackgrounds';

export interface CreatedCharacter {
  id: string;
  name: string;
  playerName: string;
  race: string;
  dialect: string;
  class: string;
  level: number;
  background: string;
  alignment: string;
  // Ability scores
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  // Standard 5e HP & Armor
  hpCurrent: number;
  hpMax: number;
  tempHp: number;
  ac: number;
  speed: number;
  initiativeMod: number;
  passivePerception: number;
  // Equipment
  weaponName: string;
  armorName: string;
  // Standard 5e Currencies
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  // Proficiencies & Skills
  savingThrows: string[];
  skills: string[];
  tools: string[];
  bio: string;
  pin: string;
}

export type ArchetypeTriad = 'combat' | 'stealth' | 'magic';

export interface QuizQuestion {
  id: number;
  scenario: string;
  options: {
    text: string;
    archetype: ArchetypeTriad;
    flavor: string;
  }[];
}

export const QUIZ_QUESTIONS_10: QuizQuestion[] = [
  {
    id: 1,
    scenario: 'A heavy iron portcullis in ancient ruins is slowly descending, threatening to trap your wounded ally behind it. How do you respond?',
    options: [
      { text: 'Brace your shoulders beneath the iron spikes and heave upward with sheer physical might.', archetype: 'combat', flavor: 'Martial power, fortitude, and physical resolve.' },
      { text: 'Dive beneath the descending teeth and jam a steel piton into the gear track to freeze the winch.', archetype: 'stealth', flavor: 'Rapid reflexes, dexterity, and mechanical cunning.' },
      { text: 'Channel an arcane ward or telekinetic force to halt the descent of the gate with mystic power.', archetype: 'magic', flavor: 'Arcane study, willpower, and supernatural energy.' }
    ]
  },
  {
    id: 2,
    scenario: 'A corrupt city watch captain attempts to extort an illegal toll from impoverished travelers at the city gates.',
    options: [
      { text: 'Step forward, hand on your weapon hilt, and loudly challenge his authority under martial honor.', archetype: 'combat', flavor: 'Unyielding courage, commanding presence, and honor.' },
      { text: 'Slip over the battlements into the watchtower to pick the postern gate lock and let the travelers pass.', archetype: 'stealth', flavor: 'Infiltration, streetcraft, and nimble evasion.' },
      { text: 'Unfurl a magical seal or weave a subtle enchantment that compels the captain to apologize and waive the toll.', archetype: 'magic', flavor: 'Esoteric diplomacy and enchantments.' }
    ]
  },
  {
    id: 3,
    scenario: 'Bandit marksmen launch a surprise ambush from rocky clifftops overlooking a narrow gorge.',
    options: [
      { text: 'Raise your shield, charge up the scree, and engage the marksmen in brutal close quarters.', archetype: 'combat', flavor: 'Front-line aggression and combat dominance.' },
      { text: 'Melt into the dense tree cover, flanking the cliffside silently to eliminate them with precision.', archetype: 'stealth', flavor: 'Camouflage, quiet stalking, and ambush.' },
      { text: 'Conjure a billowing fog bank and retaliate with guided projectile motes of crackling energy.', archetype: 'magic', flavor: 'Battlefield battlefield control and evocation.' }
    ]
  },
  {
    id: 4,
    scenario: 'A sealed stone crypt is trapped with pressurized poison gas vents and intricate needle locks.',
    options: [
      { text: 'Use a crowbar and heavy sledge to shatter the outer door hinge from behind a protective mantle.', archetype: 'combat', flavor: 'Direct destructive breach.' },
      { text: 'Inspect the seam for tripwires, gently sliding thieves\' tools inside to disable the triggers.', archetype: 'stealth', flavor: 'Meticulous precision and deft sleight of hand.' },
      { text: 'Sense the magical resonance of the runes, tracing a neutralizing counter-glyph over the lock plate.', archetype: 'magic', flavor: 'Ancient arcana, divination, and ritual precision.' }
    ]
  },
  {
    id: 5,
    scenario: 'A drunken brawl erupts across a crowded tavern as weapons are unsheathed and tables flipped.',
    options: [
      { text: 'Wade into the melee, grappling the instigators and establishing order through overwhelming force.', archetype: 'combat', flavor: 'Martial intimidation and raw brawling.' },
      { text: 'Slide past the brawlers, secure the valuable wager chest from the mantle, and slip out the back.', archetype: 'stealth', flavor: 'Opportunism, nimble footwork, and misdirection.' },
      { text: 'Cast an incantation that calms passions, or command the room with a thunderous resonant boom.', archetype: 'magic', flavor: 'Bardic charisma, crowd control, and mind magic.' }
    ]
  },
  {
    id: 6,
    scenario: 'Your party is lost in an endless, freezing blizzard high on a treacherous mountain pass.',
    options: [
      { text: 'Take the lead through waist-deep snow, enduring the freezing gale to forge a path for others.', archetype: 'combat', flavor: 'Unbroken constitution and endurance.' },
      { text: 'Scout ahead among wind-carved crags to locate a concealed cave sheltered from the storm.', archetype: 'stealth', flavor: 'Wilderness navigation and keen perception.' },
      { text: 'Summon an elemental flame or create a sheltered pocket dimension of warm air.', archetype: 'magic', flavor: 'Planar manipulation and elemental harmony.' }
    ]
  },
  {
    id: 7,
    scenario: 'A wild beast—a starving manticore—guards the only rope bridge spanning a dizzying canyon.',
    options: [
      { text: 'Square your stance, roar a challenge, and prepare to duel the beast in direct combat.', archetype: 'combat', flavor: 'Martial ferocity and defiance.' },
      { text: 'Creep along the cliffside underbelly, stringing a secondary zipline while the beast is distracted.', archetype: 'stealth', flavor: 'Acrobatics, distraction, and evasion.' },
      { text: 'Cast an animal friendship or illusion to pacify its hunger and allow peaceful crossing.', archetype: 'magic', flavor: 'Primal empathy and nature communion.' }
    ]
  },
  {
    id: 8,
    scenario: 'A rival noble house accuses you of high treason in front of the royal court.',
    options: [
      { text: 'Demand trial by combat before the high gods and knights of the realm.', archetype: 'combat', flavor: 'Righteous steel and chivalric tradition.' },
      { text: 'Produce forged correspondence or stolen ledgers proving the accuser himself is the traitor.', archetype: 'stealth', flavor: 'Espionage, counter-intelligence, and subterfuge.' },
      { text: 'Invoke ancient oaths and recite forgotten royal charters, weaving a persuasive oratorical spell.', archetype: 'magic', flavor: 'Rhetoric, historical insight, and truth divination.' }
    ]
  },
  {
    id: 9,
    scenario: 'You encounter a subterranean pool glowing with eldritch bioluminescence and whispering voices.',
    options: [
      { text: 'Submerge your hand to test its resistance, ready to battle whatever lurks in the deep.', archetype: 'combat', flavor: 'Fearless bravery in the dark.' },
      { text: 'Skirt the damp cavern rim silently, studying the reflections without making a ripple.', archetype: 'stealth', flavor: 'Caution, alertness, and shadows.' },
      { text: 'Commune with the liquid matrix, identifying the planar confluence powering the phenomenon.', archetype: 'magic', flavor: 'Mystic investigation and planar metaphysics.' }
    ]
  },
  {
    id: 10,
    scenario: 'Before the final confrontation with an evil warlord, what is your chosen preparation?',
    options: [
      { text: 'Sharpen your blade, test the straps on your plate armor, and steel your mind for battle.', archetype: 'combat', flavor: 'Flawless martial readiness and iron discipline.' },
      { text: 'Scout the warlord\'s fortress perimeter, mapping guard patrols and escape routes.', archetype: 'stealth', flavor: 'Tactical scouting and asymmetric preparation.' },
      { text: 'Review your spell grimoire, prepare mystic components, and weave defensive abjurations.', archetype: 'magic', flavor: 'Arcane preparation and magical strategy.' }
    ]
  }
];

export interface ClassArchetypeDefinition {
  name: string;
  subclass: string;
  archetype: ArchetypeTriad;
  hitDie: number;
  primaryStat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  statPriority: Array<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>;
  savingThrows: string[];
  skills: string[];
  armorName: string;
  baseAc: number; // Functional standard AC
  weaponName: string;
  suggestedRace: string;
  suggestedBackground: string;
}

export const CLASS_ARCHETYPES: Record<string, ClassArchetypeDefinition> = {
  // COMBAT TRIAD
  Fighter: {
    name: 'Fighter',
    subclass: 'Champion',
    archetype: 'combat',
    hitDie: 10,
    primaryStat: 'str',
    statPriority: ['str', 'con', 'dex', 'wis', 'int', 'cha'],
    savingThrows: ['Strength', 'Constitution'],
    skills: ['Athletics', 'Perception'],
    armorName: 'Chain Mail & Shield',
    baseAc: 18, // Chain mail (16) + Shield (2)
    weaponName: 'Longsword (1d8/1d10 slashing)',
    suggestedRace: 'Human',
    suggestedBackground: 'Soldier'
  },
  Barbarian: {
    name: 'Barbarian',
    subclass: 'Berserker',
    archetype: 'combat',
    hitDie: 12,
    primaryStat: 'str',
    statPriority: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    savingThrows: ['Strength', 'Constitution'],
    skills: ['Athletics', 'Intimidation'],
    armorName: 'Unarmored Defense',
    baseAc: 15, // 10 + DEX + CON
    weaponName: 'Greataxe (1d12 slashing, heavy, two-handed)',
    suggestedRace: 'Half-Orc',
    suggestedBackground: 'Folk Hero'
  },
  Paladin: {
    name: 'Paladin',
    subclass: 'Oath of Devotion',
    archetype: 'combat',
    hitDie: 10,
    primaryStat: 'str',
    statPriority: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
    savingThrows: ['Wisdom', 'Charisma'],
    skills: ['Athletics', 'Persuasion'],
    armorName: 'Chain Mail & Shield',
    baseAc: 18,
    weaponName: 'Warhammer (1d8/1d10 bludgeoning, versatile)',
    suggestedRace: 'Human',
    suggestedBackground: 'Noble'
  },

  // STEALTH TRIAD
  Rogue: {
    name: 'Rogue',
    subclass: 'Thief',
    archetype: 'stealth',
    hitDie: 8,
    primaryStat: 'dex',
    statPriority: ['dex', 'int', 'con', 'wis', 'cha', 'str'],
    savingThrows: ['Dexterity', 'Intelligence'],
    skills: ['Stealth', 'Sleight of Hand', 'Deception', 'Acrobatics'],
    armorName: 'Leather Armor',
    baseAc: 14, // 11 + DEX mod (+3)
    weaponName: 'Rapier (1d8 piercing, finesse) & Shortbow',
    suggestedRace: 'Elf',
    suggestedBackground: 'Criminal'
  },
  Ranger: {
    name: 'Ranger',
    subclass: 'Hunter',
    archetype: 'stealth',
    hitDie: 10,
    primaryStat: 'dex',
    statPriority: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    savingThrows: ['Strength', 'Dexterity'],
    skills: ['Stealth', 'Survival', 'Perception'],
    armorName: 'Scale Mail',
    baseAc: 16, // 14 + DEX mod (max 2)
    weaponName: 'Longbow (1d8 piercing, range 150/600) & Two Shortswords',
    suggestedRace: 'Elf',
    suggestedBackground: 'Folk Hero'
  },
  Monk: {
    name: 'Monk',
    subclass: 'Way of the Open Hand',
    archetype: 'stealth',
    hitDie: 8,
    primaryStat: 'dex',
    statPriority: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    savingThrows: ['Strength', 'Dexterity'],
    skills: ['Acrobatics', 'Insight'],
    armorName: 'Unarmored Defense',
    baseAc: 15, // 10 + DEX + WIS
    weaponName: 'Shortsword & Martial Arts Unarmed Strike (1d4 bludgeoning)',
    suggestedRace: 'Human',
    suggestedBackground: 'Acolyte'
  },

  // MAGIC TRIAD
  Wizard: {
    name: 'Wizard',
    subclass: 'School of Evocation',
    archetype: 'magic',
    hitDie: 6,
    primaryStat: 'int',
    statPriority: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
    savingThrows: ['Intelligence', 'Wisdom'],
    skills: ['Arcana', 'History'],
    armorName: 'Scholar\'s Robes (Mage Armor: AC 13 + DEX)',
    baseAc: 12, // 10 + DEX mod (+2)
    weaponName: 'Arcane Staff (1d6 bludgeoning) & Spellbook',
    suggestedRace: 'Gnome',
    suggestedBackground: 'Sage'
  },
  Cleric: {
    name: 'Cleric',
    subclass: 'Life Domain',
    archetype: 'magic',
    hitDie: 8,
    primaryStat: 'wis',
    statPriority: ['wis', 'con', 'str', 'cha', 'int', 'dex'],
    savingThrows: ['Wisdom', 'Charisma'],
    skills: ['Insight', 'Religion'],
    armorName: 'Scale Mail & Shield',
    baseAc: 16, // 14 + 2 shield
    weaponName: 'Mace (1d6 bludgeoning) & Holy Symbol',
    suggestedRace: 'Dwarf',
    suggestedBackground: 'Acolyte'
  },
  Sorcerer: {
    name: 'Sorcerer',
    subclass: 'Draconic Bloodline',
    archetype: 'magic',
    hitDie: 6,
    primaryStat: 'cha',
    statPriority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    savingThrows: ['Constitution', 'Charisma'],
    skills: ['Arcana', 'Persuasion'],
    armorName: 'Draconic Resilience (AC 13 + DEX)',
    baseAc: 15,
    weaponName: 'Light Crossbow (1d8 piercing) & Two Daggers',
    suggestedRace: 'Dragonborn',
    suggestedBackground: 'Noble'
  },
  Warlock: {
    name: 'Warlock',
    subclass: 'The Fiend',
    archetype: 'magic',
    hitDie: 8,
    primaryStat: 'cha',
    statPriority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    savingThrows: ['Wisdom', 'Charisma'],
    skills: ['Arcana', 'Deception'],
    armorName: 'Leather Armor',
    baseAc: 13,
    weaponName: 'Arcane Focus Wand & Dagger',
    suggestedRace: 'Tiefling',
    suggestedBackground: 'Sage'
  },
  Bard: {
    name: 'Bard',
    subclass: 'College of Lore',
    archetype: 'magic',
    hitDie: 8,
    primaryStat: 'cha',
    statPriority: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
    savingThrows: ['Dexterity', 'Charisma'],
    skills: ['Performance', 'Persuasion', 'Insight'],
    armorName: 'Leather Armor',
    baseAc: 13,
    weaponName: 'Rapier (1d8 piercing) & Lute',
    suggestedRace: 'Half-Elf',
    suggestedBackground: 'Noble'
  },
  Druid: {
    name: 'Druid',
    subclass: 'Circle of the Land',
    archetype: 'magic',
    hitDie: 8,
    primaryStat: 'wis',
    statPriority: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
    savingThrows: ['Intelligence', 'Wisdom'],
    skills: ['Nature', 'Survival'],
    armorName: 'Hide Armor & Wooden Shield',
    baseAc: 14,
    weaponName: 'Scimitar (1d6 slashing, finesse) & Druidic Focus',
    suggestedRace: 'Elf',
    suggestedBackground: 'Folk Hero'
  }
};

export const RACIAL_BONUSES: Record<string, {
  bonus: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>;
  speed: number;
  language: string;
}> = {
  Human: { bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, language: 'Common' },
  Elf: { bonus: { dex: 2, int: 1 }, speed: 30, language: 'Elvish' },
  Dwarf: { bonus: { con: 2, str: 1 }, speed: 25, language: 'Dwarvish' },
  Halfling: { bonus: { dex: 2, cha: 1 }, speed: 25, language: 'Halfling' },
  Dragonborn: { bonus: { str: 2, cha: 1 }, speed: 30, language: 'Draconic' },
  Gnome: { bonus: { int: 2, con: 1 }, speed: 25, language: 'Gnomish' },
  'Half-Elf': { bonus: { cha: 2, dex: 1, con: 1 }, speed: 30, language: 'Common, Elvish' },
  'Half-Orc': { bonus: { str: 2, con: 1 }, speed: 30, language: 'Orc' },
  Tiefling: { bonus: { cha: 2, int: 1 }, speed: 30, language: 'Infernal' }
};

export function getAbilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Procedurally builds a complete 5e SRD character from Name and Level (1-20).
 */
export function generateCharacterFromTally(
  name: string,
  level: number,
  tallies: { combat: number; stealth: number; magic: number }
): CreatedCharacter {
  const safeLevel = Math.max(1, Math.min(20, Math.floor(level) || 1));
  const safeName = name.trim() || 'Adventurer of Graywood';

  // Determine primary archetype triad
  let winningTriad: ArchetypeTriad = 'combat';
  if (tallies.stealth > tallies.combat && tallies.stealth >= tallies.magic) {
    winningTriad = 'stealth';
  } else if (tallies.magic > tallies.combat && tallies.magic > tallies.stealth) {
    winningTriad = 'magic';
  }

  // Select candidate class based on triad and runner-up
  let targetClass = 'Fighter';
  if (winningTriad === 'combat') {
    if (tallies.magic >= tallies.stealth) targetClass = 'Paladin';
    else targetClass = 'Fighter';
  } else if (winningTriad === 'stealth') {
    if (tallies.combat > tallies.magic) targetClass = 'Ranger';
    else targetClass = 'Rogue';
  } else {
    if (tallies.combat >= tallies.stealth) targetClass = 'Cleric';
    else targetClass = 'Wizard';
  }

  return buildStandardCharacter(safeName, safeLevel, targetClass);
}

/**
 * Construct full 5e SRD Character using Standard Array (15, 14, 13, 12, 10, 8),
 * racial adjustments, and ASI scaling per 5e rules.
 */
export function buildStandardCharacter(
  name: string,
  level: number,
  className: string
): CreatedCharacter {
  const safeLevel = Math.max(1, Math.min(20, Math.floor(level) || 1));
  const clsDef = CLASS_ARCHETYPES[className] || CLASS_ARCHETYPES['Fighter'];
  const raceName = clsDef.suggestedRace;
  const raceDef = RACIAL_BONUSES[raceName] || RACIAL_BONUSES['Human'];
  const bgName = clsDef.suggestedBackground;
  const bgDef: SrdBackground = SRD_BACKGROUNDS[bgName] || SRD_BACKGROUNDS['Soldier'];

  // Standard Array mapped to class priorities
  const standardArray = [15, 14, 13, 12, 10, 8];
  const scores: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number> = {
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10
  };

  clsDef.statPriority.forEach((stat, idx) => {
    scores[stat] = standardArray[idx];
  });

  // Apply Racial Bonuses
  for (const [stat, bonus] of Object.entries(raceDef.bonus)) {
    if (bonus) {
      scores[stat as keyof typeof scores] += bonus;
    }
  }

  // Apply ASI scaling (Levels 4, 8, 12, 16, 19: +2 to primary stat up to 20, then con)
  const asiCount = [4, 8, 12, 16, 19].filter(l => safeLevel >= l).length;
  for (let i = 0; i < asiCount; i++) {
    if (scores[clsDef.primaryStat] < 20) {
      scores[clsDef.primaryStat] = Math.min(20, scores[clsDef.primaryStat] + 2);
    } else if (scores.con < 20) {
      scores.con = Math.min(20, scores.con + 2);
    } else {
      scores.dex = Math.min(20, scores.dex + 2);
    }
  }

  const conMod = getAbilityMod(scores.con);
  const dexMod = getAbilityMod(scores.dex);
  const wisMod = getAbilityMod(scores.wis);

  // Standard 5e HP Calculation: Max at lvl 1 + average for subsequent levels
  const avgHitDie = Math.floor(clsDef.hitDie / 2) + 1;
  const hpLvl1 = clsDef.hitDie + conMod;
  const hpSubsequent = (safeLevel - 1) * Math.max(1, avgHitDie + conMod);
  const totalHp = Math.max(safeLevel, hpLvl1 + hpSubsequent);

  // Combine Proficiencies
  const combinedSkills = Array.from(new Set([...clsDef.skills, ...bgDef.skillProficiencies]));
  const combinedTools = Array.from(new Set([...bgDef.toolOrLanguageProficiencies]));

  // Standard 5e Currency baseline
  const gp = 15 + safeLevel * 10;

  return {
    id: `char-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim() || `${raceName} ${clsDef.name}`,
    playerName: 'Player',
    race: raceName,
    dialect: raceDef.language,
    class: `${clsDef.name} (${clsDef.subclass})`,
    level: safeLevel,
    background: bgName,
    alignment: 'Neutral Good',
    str: scores.str,
    dex: scores.dex,
    con: scores.con,
    int: scores.int,
    wis: scores.wis,
    cha: scores.cha,
    hpCurrent: totalHp,
    hpMax: totalHp,
    tempHp: 0,
    ac: clsDef.baseAc,
    speed: raceDef.speed,
    initiativeMod: dexMod, // STRICT DEXTERITY MODIFIER ONLY
    passivePerception: 10 + wisMod + 2,
    weaponName: clsDef.weaponName,
    armorName: clsDef.armorName,
    cp: 20,
    sp: 50,
    ep: 0,
    gp,
    pp: 0,
    savingThrows: clsDef.savingThrows,
    skills: combinedSkills,
    tools: combinedTools,
    bio: `${raceName} ${clsDef.name} (${clsDef.subclass}) with the ${bgName} background. Feature: ${bgDef.feature.name}. ${bgDef.feature.description}`,
    pin: Math.floor(1000 + Math.random() * 9000).toString()
  };
}
