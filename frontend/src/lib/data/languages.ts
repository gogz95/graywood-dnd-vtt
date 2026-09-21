// src/lib/data/languages.ts
// Standard 5e SRD Baseline Languages and Races

export const STANDARD_5E_LANGUAGES = [
  'Common',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
  'Abyssal',
  'Celestial',
  'Draconic',
  'Deep Speech',
  'Infernal',
  'Primordial',
  'Sylvan',
  'Undercommon',
] as const;

export type Standard5eLanguage = (typeof STANDARD_5E_LANGUAGES)[number];

export const STANDARD_5E_RACES = [
  'Human',
  'Elf',
  'Dwarf',
  'Halfling',
  'Dragonborn',
  'Gnome',
  'Half-Elf',
  'Half-Orc',
  'Tiefling',
] as const;

export type Standard5eRace = (typeof STANDARD_5E_RACES)[number];

export const STANDARD_5E_CLASSES = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
] as const;

export type Standard5eClass = (typeof STANDARD_5E_CLASSES)[number];

export const STANDARD_5E_CURRENCIES = [
  { code: 'cp', name: 'Copper Piece', valueInCp: 1 },
  { code: 'sp', name: 'Silver Piece', valueInCp: 10 },
  { code: 'ep', name: 'Electrum Piece', valueInCp: 50 },
  { code: 'gp', name: 'Gold Piece', valueInCp: 100 },
  { code: 'pp', name: 'Platinum Piece', valueInCp: 1000 },
] as const;
