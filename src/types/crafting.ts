export interface ElementalEssence {
  id: string;
  name: string;
  category: string;
  tier: number;
  ingredient_points: number;
  weapon_bonus_dice: string;
  weapon_damage_type: string;
  armor_reduction_type: 'PB' | 'Resistance';
  armor_damage_type: string;
  description: string;
}

export interface ItemSocket {
  id: string;
  item_id: string;
  socket_index: number;
  slotted_essence_id: string | null;
  created_at: number;
}

export interface CraftingEvaluation {
  total_ingredient_points: number;
  is_stable: boolean;
  requires_alchemical_lab: boolean;
  volatility_risk_percent: number;
  projected_weapon_damage_bonuses: string[];
  projected_armor_reductions: string[];
  summary_message: string;
}

export interface SocketEssencePayload {
  item_id: string;
  socket_index: number;
  essence_id: string | null;
}
