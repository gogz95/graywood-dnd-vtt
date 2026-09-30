// src/lib/types/actor.ts
// Procedural Actor & 5e SRD Non-Player Character Schema

export type NpcCulture = 'common' | 'human' | 'elven' | 'dwarven' | 'draconic' | 'orcish';

export type NpcArchetype = 'Guard' | 'Mage' | 'Priest' | 'Bandit' | 'Noble';

export interface AbilityScorePair {
  score: number;
  modifier: number;
}

export interface ActorAttributes {
  str: AbilityScorePair;
  dex: AbilityScorePair;
  con: AbilityScorePair;
  int: AbilityScorePair;
  wis: AbilityScorePair;
  cha: AbilityScorePair;
}

export interface ActorAction {
  name: string;
  description: string;
  attackBonus?: number;
  damage?: string;
}

export interface ActorTrait {
  name: string;
  description: string;
}

export interface ActorPersonality {
  trait: string;
  ideal: string;
  bond: string;
  flaw: string;
}

export interface ActorTokenMeta {
  color: string;
  initials: string;
  sizeInCells: number;
}

export interface ActorSchema {
  id: string;
  name: string;
  culture: NpcCulture;
  archetype: NpcArchetype;
  cr: number;
  level: number;
  alignment: string;
  size: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';
  type: string;
  attributes: ActorAttributes;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number;
  speed: number;
  initiative: number;
  proficiencyBonus: number;
  personality: ActorPersonality;
  appearance: string;
  occupation: string;
  actions: ActorAction[];
  traits: ActorTrait[];
  token: ActorTokenMeta;
  createdAt: number;
}

export interface NpcGeneratorOptions {
  culture?: NpcCulture | string;
  cr?: number;
  archetype?: NpcArchetype | string;
  name?: string;
  minLen?: number;
  maxLen?: number;
  seed?: number;
}
