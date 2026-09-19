// item.ts — Master schema and types for DM Custom Items, Equipment Durability, and Trading

export type ItemType =
  | 'weapon'
  | 'armor'
  | 'gear'
  | 'potion'
  | 'scroll'
  | 'wondrous'
  | 'ingredient';

export type ItemRarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Very Rare'
  | 'Legendary'
  | 'Artifact';

export interface CustomItemDefinition {
  id: string;
  name: string;
  type: ItemType;
  category: string;
  rarity: ItemRarity;
  weight: number; // lbs
  costGp?: number;
  description: string;

  // Durability RP & Sunder System (Aleamos House Rules)
  currentRp?: number;
  maxRp?: number;

  // Weapon combat parameters
  attackBonus?: number;
  damageFormula?: string;
  damageType?: string;

  // Armor combat parameters
  acBonus?: number;

  // Perishable Harvest & Foraging decay
  isPerishable?: boolean;
  harvestTimestamp?: number | null; // epoch seconds or ms

  // Essence Matrix (Aleamos 28-Essence Alchemy/Crafting)
  essenceTag?: string;

  // General 5e properties
  properties?: string[];
  requiresAttunement?: boolean;
  source?: 'custom' | 'srd' | 'imported';
  createdAt?: number;
}

export type TradeHandshakeStatus = 'OFFERED' | 'ACCEPTED' | 'DECLINED';

export interface TradeOfferPayload {
  trade_id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  item: CustomItemDefinition & {
    quantity: number;
    currentRp?: number;
    maxRp?: number;
    weight?: number;
    weight_lbs?: number;
    harvestTimestamp?: number | null;
    essenceTag?: string;
    [key: string]: any;
  };
  quantity: number;
  timestamp: number;
  notes?: string;
}

export interface TradeAcceptPayload {
  trade_id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  item_id: string;
  item_name: string;
  quantity: number;
  timestamp: number;
}

export interface TradeDeclinePayload {
  trade_id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  item_id: string;
  item_name: string;
  timestamp: number;
  reason?: string;
}

export interface TradeAuditLogPayload {
  trade_id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  item_id: string;
  item_name: string;
  quantity: number;
  status: TradeHandshakeStatus;
  timestamp: number;
  notes?: string;
}
