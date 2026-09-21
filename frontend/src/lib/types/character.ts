// src/lib/types/character.ts
// Complete D&D 5e / Aleamos Hybrid Unified Character Data Schema

export type AbilityName = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export type SkillProficiencyTier = 'none' | 'proficient' | 'expertise';

export interface AbilityScoreData {
  score: number;
  modifier: number;
  saveProficient: boolean;
  saveBonus: number;
}

export interface SkillEntry {
  name: string;
  governingAbility: AbilityName;
  tier: SkillProficiencyTier;
  modifier: number;
}

export interface EquipmentDurabilityPiece {
  id: string;
  name: string;
  slot: 'mainHand' | 'offHand' | 'armor' | 'shield' | 'accessory';
  currentRp: number;
  maxRp: number;
  isBroken: boolean;
  sunderPenalty: number;
}

export interface SpellSlotTier {
  current: number;
  max: number;
}

export interface CompanionAnimal {
  id: string;
  name: string;
  species: string;
  type: 'mount' | 'beast' | 'familiar' | 'pack_animal';
  currentHp: number;
  maxHp: number;
  ac: number;
  speed: number;
  str: number;
  cargoWeight: number;
  capacityLbs: number;
  feedDaysRemaining: number;
  isBeastOfBurden: boolean;
  conditions: string[];
}

export interface CurrencyWallet {
  cp: number; // Copper (cp)
  sp: number; // Silver (sp)
  ep?: number; // Electrum (ep)
  gp: number; // Gold (gp)
  pp?: number; // Platinum (pp)
  sunTradeBars?: number; // Legacy trade bars
}

export interface CharacterDeathSaves {
  successes: number;
  failures: number;
}

export interface CharacterHitDice {
  current: number;
  total: number;
  dieType: string; // e.g. 'd8', 'd10', 'd12'
}

export interface CharacterSpellcasting {
  casterLevel: number;
  spellcastingAbility: AbilityName;
  spellSaveDc: number;
  spellAttackBonus: number;
  slots: {
    1: SpellSlotTier;
    2: SpellSlotTier;
    3: SpellSlotTier;
    4: SpellSlotTier;
    5: SpellSlotTier;
    6: SpellSlotTier;
    7: SpellSlotTier;
    8: SpellSlotTier;
    9: SpellSlotTier;
  };
  pactMagic?: SpellSlotTier;
  preparedSpells: string[];
  knownCantrips: string[];
}

export interface Character {
  // Identity
  id: string;
  name: string;
  playerName: string;
  race: string;
  subrace?: string;
  class: string;
  subclass?: string;
  level: number;
  experience: number;
  background: string;
  alignment: string;
  inspiration: boolean;

  // Vitals & Resiliences
  currentHp: number;
  maxHp: number;
  tempHp: number;
  deathSaves: CharacterDeathSaves;
  hitDice: CharacterHitDice;
  exhaustionLevel: number; // 0 to 6 scale

  // Tri-Stat & Defense
  armorClass: number;
  initiativeBonus: number;
  walkingSpeed: number;
  swimmingSpeed: number;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;

  // Ability Scores & Saves
  abilities: Record<AbilityName, AbilityScoreData>;

  // 18 Standard Skills
  skills: Record<string, SkillEntry>;

  // Aleamos Equipment RP & Sunder
  equipmentDurability: EquipmentDurabilityPiece[];

  // Spellcasting & Slots
  spellcasting: CharacterSpellcasting;

  // Currency
  currency: CurrencyWallet;

  // Pets & Mounts
  companions: CompanionAnimal[];

  // Aleamos Specific Meta
  isOrbSealed?: boolean;
  manaPotionsDrunkLongRest: number;
  conditions: string[];
  notes: string;
}

export const STANDARD_5E_SKILLS: { name: string; ability: AbilityName }[] = [
  { name: 'Acrobatics', ability: 'dex' },
  { name: 'Animal Handling', ability: 'wis' },
  { name: 'Arcana', ability: 'int' },
  { name: 'Athletics', ability: 'str' },
  { name: 'Deception', ability: 'cha' },
  { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' },
  { name: 'Intimidation', ability: 'cha' },
  { name: 'Investigation', ability: 'int' },
  { name: 'Medicine', ability: 'wis' },
  { name: 'Nature', ability: 'int' },
  { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' },
  { name: 'Persuasion', ability: 'cha' },
  { name: 'Religion', ability: 'int' },
  { name: 'Sleight of Hand', ability: 'dex' },
  { name: 'Stealth', ability: 'dex' },
  { name: 'Survival', ability: 'wis' }
];

export function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function calculateProficiencyBonus(level: number): number {
  return Math.floor((level - 1) / 4) + 2;
}

export function computeDerivedSkills(
  abilities: Record<AbilityName, AbilityScoreData>,
  skillTiers: Record<string, SkillProficiencyTier>,
  profBonus: number
): Record<string, SkillEntry> {
  const result: Record<string, SkillEntry> = {};
  for (const sk of STANDARD_5E_SKILLS) {
    const tier = skillTiers[sk.name] || 'none';
    const abilityMod = abilities[sk.ability].modifier;
    let mod = abilityMod;
    if (tier === 'proficient') mod += profBonus;
    else if (tier === 'expertise') mod += profBonus * 2;
    result[sk.name] = {
      name: sk.name,
      governingAbility: sk.ability,
      tier,
      modifier: mod
    };
  }
  return result;
}

export function createDefaultCharacter(id: string, name: string, className = 'Fighter', level = 1): Character {
  const prof = calculateProficiencyBonus(level);
  const abilities: Record<AbilityName, AbilityScoreData> = {
    str: { score: 16, modifier: 3, saveProficient: true, saveBonus: 3 + prof },
    dex: { score: 14, modifier: 2, saveProficient: false, saveBonus: 2 },
    con: { score: 15, modifier: 2, saveProficient: true, saveBonus: 2 + prof },
    int: { score: 10, modifier: 0, saveProficient: false, saveBonus: 0 },
    wis: { score: 12, modifier: 1, saveProficient: false, saveBonus: 1 },
    cha: { score: 8, modifier: -1, saveProficient: false, saveBonus: -1 }
  };

  const skillTiers: Record<string, SkillProficiencyTier> = {
    Athletics: 'proficient',
    Perception: 'proficient',
    Survival: 'none'
  };

  const skills = computeDerivedSkills(abilities, skillTiers, prof);

  return {
    id,
    name,
    playerName: 'Player',
    race: 'Human',
    class: className,
    level,
    experience: 0,
    background: 'Soldier',
    alignment: 'Neutral Good',
    inspiration: false,

    currentHp: 12,
    maxHp: 12,
    tempHp: 0,
    deathSaves: { successes: 0, failures: 0 },
    hitDice: { current: level, total: level, dieType: 'd10' },
    exhaustionLevel: 0,

    armorClass: 16,
    initiativeBonus: abilities.dex.modifier,
    walkingSpeed: 30,
    swimmingSpeed: 15,
    passivePerception: 10 + skills.Perception.modifier,
    passiveInvestigation: 10 + skills.Investigation.modifier,
    passiveInsight: 10 + skills.Insight.modifier,

    abilities,
    skills,

    equipmentDurability: [
      { id: 'eq-1', name: 'Longsword', slot: 'mainHand', currentRp: 15, maxRp: 15, isBroken: false, sunderPenalty: 0 },
      { id: 'eq-2', name: 'Chain Mail', slot: 'armor', currentRp: 20, maxRp: 20, isBroken: false, sunderPenalty: 0 },
      { id: 'eq-3', name: 'Shield', slot: 'shield', currentRp: 10, maxRp: 10, isBroken: false, sunderPenalty: 0 }
    ],

    spellcasting: {
      casterLevel: 0,
      spellcastingAbility: 'int',
      spellSaveDc: 8 + prof + abilities.int.modifier,
      spellAttackBonus: prof + abilities.int.modifier,
      slots: {
        1: { current: 0, max: 0 },
        2: { current: 0, max: 0 },
        3: { current: 0, max: 0 },
        4: { current: 0, max: 0 },
        5: { current: 0, max: 0 },
        6: { current: 0, max: 0 },
        7: { current: 0, max: 0 },
        8: { current: 0, max: 0 },
        9: { current: 0, max: 0 }
      },
      preparedSpells: [],
      knownCantrips: []
    },

    currency: {
      gp: 25,
      sp: 40,
      cp: 85,
      sunTradeBars: 0
    },

    companions: [],
    manaPotionsDrunkLongRest: 0,
    conditions: [],
    notes: 'Loyal veteran of the Concord border defense.'
  };
}

export function performShortRest(char: Character, hitDiceToSpend: number, restoreRpSuccess: boolean): Character {
  const updated = structuredClone(char);
  // Spend hit dice if available
  const spent = Math.min(hitDiceToSpend, updated.hitDice.current);
  updated.hitDice.current = Math.max(0, updated.hitDice.current - spent);

  // Field maintenance restores 5 RP if tool check DC was met
  if (restoreRpSuccess) {
    for (const piece of updated.equipmentDurability) {
      if (piece.currentRp < piece.maxRp) {
        piece.currentRp = Math.min(piece.maxRp, piece.currentRp + 5);
        if (piece.currentRp > 0) {
          piece.isBroken = false;
          piece.sunderPenalty = 0;
        }
      }
    }
  }

  return updated;
}

export function performLongRest(char: Character): Character {
  const updated = structuredClone(char);

  // Reset HP & Temp HP
  updated.currentHp = updated.maxHp;
  updated.tempHp = 0;

  // Restore up to half max hit dice (minimum 1)
  const restoredHitDice = Math.max(1, Math.floor(updated.hitDice.total / 2));
  updated.hitDice.current = Math.min(updated.hitDice.total, updated.hitDice.current + restoredHitDice);

  // Clear 1 level of non-permanent exhaustion
  if (updated.exhaustionLevel > 0) {
    updated.exhaustionLevel = Math.max(0, updated.exhaustionLevel - 1);
  }

  // Reset spell slots
  for (const lvl of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
    updated.spellcasting.slots[lvl].current = updated.spellcasting.slots[lvl].max;
  }
  if (updated.spellcasting.pactMagic) {
    updated.spellcasting.pactMagic.current = updated.spellcasting.pactMagic.max;
  }

  // Reset mana potion toxicity counter
  updated.manaPotionsDrunkLongRest = 0;

  // Reset death saves
  updated.deathSaves = { successes: 0, failures: 0 };

  return updated;
}
