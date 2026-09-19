import { writable, get } from 'svelte/store';
import type {
  Character,
  PublicRosterEntry,
  InventoryItem,
  CurrencyPouch,
  ClaimResponse,
  ActionResponse,
} from '../types/character';

export const rosterStore = writable<PublicRosterEntry[]>([]);
export const characterStore = writable<Character | null>(null);
export const inventoryStore = writable<InventoryItem[]>([]);
export const currencyStore = writable<CurrencyPouch>({
  character_id: '',
  concord_sovereigns: 142,
  ay_modlahd_sun_disks: 45,
  rucean_rings: 12,
  trade_bars: 3,
  updated_at: Date.now(),
});
export const tokenStore = writable<string | null>(null);
export const isClaimingStore = writable<boolean>(false);
export const claimErrorStore = writable<string | null>(null);

const STORAGE_CHAR_ID_KEY = 'aleamos_claimed_character_id';
const STORAGE_PIN_KEY = 'aleamos_claimed_pin';
const STORAGE_TOKEN_KEY = 'aleamos_session_token';

// Sample initial inventory items for realistic character sheet demonstration
function createDefaultInventory(characterId: string): InventoryItem[] {
  const nowSec = Math.floor(Date.now() / 1000);
  return [
    {
      id: 'inv-item-1',
      character_id: characterId,
      name: 'Plate Armor of the Bulwark',
      quantity: 1,
      weight_lbs: 65.0,
      current_rp: 35,
      max_rp: 40,
      is_preserved: true,
      harvest_timestamp: null,
      base_value_cp: 150000,
      is_spoiled: false,
    },
    {
      id: 'inv-item-2',
      character_id: characterId,
      name: 'Sunforged Greatsword',
      quantity: 1,
      weight_lbs: 6.0,
      current_rp: 0, // Fractured durability demonstration
      max_rp: 25,
      is_preserved: true,
      harvest_timestamp: null,
      base_value_cp: 50000,
      is_spoiled: false,
    },
    {
      id: 'inv-item-3',
      character_id: characterId,
      name: 'Fresh Mandrake Root',
      quantity: 3,
      weight_lbs: 0.8,
      current_rp: 5,
      max_rp: 5,
      is_preserved: false,
      harvest_timestamp: nowSec - 18 * 3600, // 6 hours remaining before spoilage
      base_value_cp: 1200,
      is_spoiled: false,
    },
    {
      id: 'inv-item-4',
      character_id: characterId,
      name: 'Venomous Wyvern Stinger',
      quantity: 1,
      weight_lbs: 2.5,
      current_rp: 10,
      max_rp: 10,
      is_preserved: false,
      harvest_timestamp: nowSec - 95000, // > 86400 seconds ago (Spoiled!)
      base_value_cp: 1500, // Halved from 3000
      is_spoiled: true,
    },
    {
      id: 'inv-item-5',
      character_id: characterId,
      name: 'Preserved Moon-Lotus Nectar',
      quantity: 2,
      weight_lbs: 0.5,
      current_rp: 15,
      max_rp: 15,
      is_preserved: true,
      harvest_timestamp: nowSec - 120000,
      base_value_cp: 4500,
      is_spoiled: false,
    },
  ];
}

export async function fetchRoster(): Promise<void> {
  try {
    const res = await fetch('/api/characters/roster');
    if (!res.ok) {
      throw new Error(`Failed to fetch roster: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.success && Array.isArray(data.characters)) {
      rosterStore.set(data.characters);
    }
  } catch (err) {
    console.error('Error fetching roster:', err);
  }
}

export async function claimCharacter(characterId: string, pin: string): Promise<boolean> {
  isClaimingStore.set(true);
  claimErrorStore.set(null);

  try {
    const res = await fetch('/api/characters/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_id: characterId, pin }),
    });

    const data: ClaimResponse = await res.json();

    if (!res.ok || !data.success) {
      throw new Error('Invalid 4-digit PIN for selected character');
    }

    // Persist authenticated credentials in localStorage for auto-reconnect
    localStorage.setItem(STORAGE_CHAR_ID_KEY, characterId);
    localStorage.setItem(STORAGE_PIN_KEY, pin);
    localStorage.setItem(STORAGE_TOKEN_KEY, data.token);

    tokenStore.set(data.token);
    characterStore.set(data.character);
    inventoryStore.set(createDefaultInventory(data.character.id));
    currencyStore.update((curr) => ({
      ...curr,
      character_id: data.character.id,
    }));

    isClaimingStore.set(false);
    return true;
  } catch (err: any) {
    console.error('Claim error:', err);
    claimErrorStore.set(err.message || 'Authentication error');
    isClaimingStore.set(false);
    return false;
  }
}

export async function autoReconnect(): Promise<boolean> {
  const savedCharId = localStorage.getItem(STORAGE_CHAR_ID_KEY);
  const savedPin = localStorage.getItem(STORAGE_PIN_KEY);

  if (savedCharId && savedPin && savedPin.length === 4) {
    return await claimCharacter(savedCharId, savedPin);
  }
  return false;
}

export function disconnectCharacter(): void {
  localStorage.removeItem(STORAGE_CHAR_ID_KEY);
  localStorage.removeItem(STORAGE_PIN_KEY);
  localStorage.removeItem(STORAGE_TOKEN_KEY);

  characterStore.set(null);
  tokenStore.set(null);
  inventoryStore.set([]);
  claimErrorStore.set(null);
}

export async function mutateHp(newHp: number, tempHp?: number): Promise<void> {
  const current = get(characterStore);
  const token = get(tokenStore);
  if (!current) return;

  const clampedHp = Math.max(0, Math.min(newHp, current.max_hp));
  const finalTempHp = tempHp !== undefined ? Math.max(0, tempHp) : current.temp_hp;

  // Optimistic local update
  characterStore.update((c) => (c ? { ...c, current_hp: clampedHp, temp_hp: finalTempHp } : null));

  try {
    const res = await fetch('/api/characters/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        character_id: current.id,
        pin: current.pin,
        action: {
          type: 'MUTATE_HP',
          current_hp: clampedHp,
          temp_hp: finalTempHp,
        },
      }),
    });

    if (res.ok) {
      const data: ActionResponse = await res.json();
      if (data.character) {
        characterStore.set(data.character);
      }
    }
  } catch (err) {
    console.error('Error mutating HP:', err);
  }
}

export async function toggleBlackOrb(isSealed: boolean): Promise<void> {
  const current = get(characterStore);
  const token = get(tokenStore);
  if (!current) return;

  characterStore.update((c) => (c ? { ...c, is_orb_sealed: isSealed } : null));

  try {
    await fetch('/api/characters/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        character_id: current.id,
        pin: current.pin,
        action: {
          type: 'TOGGLE_BLACK_ORB',
          is_orb_sealed: isSealed,
        },
      }),
    });
  } catch (err) {
    console.error('Error toggling black orb:', err);
  }
}

export function toggleItemPreserved(itemId: string): void {
  inventoryStore.update((items) =>
    items.map((item) => {
      if (item.id === itemId) {
        return { ...item, is_preserved: !item.is_preserved };
      }
      return item;
    })
  );
}

export function executeAssayConversion(sunDisksToConvert: number): {
  mintedSovereigns: number;
  assayFeeRetained: number;
} {
  const mintedSovereigns = Math.floor(sunDisksToConvert * 0.90);
  const assayFeeRetained = sunDisksToConvert - mintedSovereigns;

  currencyStore.update((curr) => {
    return {
      ...curr,
      ay_modlahd_sun_disks: Math.max(0, curr.ay_modlahd_sun_disks - sunDisksToConvert),
      concord_sovereigns: curr.concord_sovereigns + mintedSovereigns,
      updated_at: Date.now(),
    };
  });

  return { mintedSovereigns, assayFeeRetained };
}

// WebSocket incoming event dispatchers
export function applyHpUpdateFromWs(characterId: string, currentHp: number, tempHp: number): void {
  const char = get(characterStore);
  if (char && char.id === characterId) {
    characterStore.update((c) => (c ? { ...c, current_hp: currentHp, temp_hp: tempHp } : null));
  }
}

export function applyBlackOrbToggleFromWs(characterId: string, isOrbSealed: boolean): void {
  const char = get(characterStore);
  if (char && char.id === characterId) {
    characterStore.update((c) => (c ? { ...c, is_orb_sealed: isOrbSealed } : null));
  }
}
