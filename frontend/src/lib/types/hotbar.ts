// frontend/src/lib/types/hotbar.ts
// Hotbar Slot Item & Quick-Action Protocol Schema

export type HotbarItemType = 'spell' | 'weapon' | 'feature' | 'macro' | 'audio_sfx';

export interface HotbarSlotItem {
  slotIndex: number; // 0 to 9, mapping to keys 1–9 and 0
  itemType: HotbarItemType;
  label: string;
  iconUrl?: string;
  iconGlyph?: string;
  payload: Record<string, any>; // e.g. dice roll formula, entity ID, or audio file path/trigger
}
