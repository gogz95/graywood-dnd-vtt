export interface PublicRosterEntry {
  id: string;
  name: string;
  is_orb_sealed: boolean;
}

export interface Character {
  id: string;
  name: string;
  pin: string;
  current_hp: number;
  max_hp: number;
  temp_hp: number;
  hit_dice_current: number;
  hit_dice_max: number;
  base_ac: number;
  speed: number;
  passive_perception: number;
  spell_slots_json: string;
  inventory_json: string;
  is_orb_sealed: boolean;
  resurrection_sickness_penalty: number;
}

export interface InventoryItem {
  id: string;
  character_id: string;
  name: string;
  quantity: number;
  weight_lbs: number;
  current_rp: number;
  max_rp: number;
  is_preserved: boolean;
  harvest_timestamp: number | null;
  base_value_cp: number;
  is_spoiled: boolean;
}

export interface CurrencyPouch {
  character_id: string;
  concord_sovereigns: number;
  ay_modlahd_sun_disks: number;
  rucean_rings: number;
  trade_bars: number;
  updated_at: number;
}

export interface ClaimResponse {
  success: boolean;
  token: string;
  expires_at: number;
  character: Character;
}

export interface ActionResponse {
  success: boolean;
  message: string;
  character: Character;
}
