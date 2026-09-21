export interface ActiveCombatant {
  id: string;
  encounter_id: string;
  token_id: string;
  name: string;
  initiative: number;
  hp_current: number;
  hp_max: number;
  temp_hp: number;
  ac: number;
  is_monster: boolean;
  monster_compendium_id: string | null;
  multiattack_profile: string | null;
  conditions: string[];
  exhaustion_level?: number;
  init_stat?: 'DEX' | 'INT' | 'WIS';
  scores?: {
    dex: number;
    int: number;
    wis: number;
  };
  death_saves?: {
    successes: number; // 0-3
    failures: number;  // 0-3
    isStable?: boolean;
    isDead?: boolean;
  };
}

export interface Encounter {
  id: string;
  name: string;
  round: number;
  current_turn_index: number;
  is_active: boolean;
}

export interface MonsterStatBlock {
  id: string;
  name: string;
  size: string;
  creature_type: string;
  alignment: string;
  ac: number;
  hp_max: number;
  hit_dice: string;
  speed: number;
  challenge_rating: number;
  multiattack_profile: string;
  actions_json: string;
  traits_json: string;
}

export type CombatMode = 'preparation' | 'active';

export interface SavedEncounter {
  encounter: Encounter;
  combatants: ActiveCombatant[];
}
