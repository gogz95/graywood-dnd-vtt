// sessionStore.ts — Master session state coordinator for 5e VTT Workstation
// Coordinates Active Combat injection from Compendium and Party Stash inventory ledger

import { writable, get } from 'svelte/store';
import type { ActiveCombatant, SavedEncounter, Encounter } from '../types/combat';

export interface PartyStashItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  weight: number;
  description: string;
  valueGp?: number;
}

const STORAGE_STASH_KEY = 'vtt_party_stash';
const STORAGE_ENCOUNTERS_KEY = 'vtt_encounters';

function loadInitialStash(): PartyStashItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_STASH_KEY);
    if (raw) return JSON.parse(raw) as PartyStashItem[];
  } catch {
    // default
  }
  return [
    {
      id: 'stash-1',
      name: 'Potion of Healing',
      category: 'Potion',
      quantity: 4,
      weight: 0.5,
      description: 'Regains 2d4 + 2 hit points when consumed.',
      valueGp: 50,
    },
    {
      id: 'stash-2',
      name: 'Hempen Rope (50 ft)',
      category: 'Gear',
      quantity: 2,
      weight: 10.0,
      description: 'Standard 50-foot adventuring rope with grappling hook.',
      valueGp: 1,
    },
    {
      id: 'stash-3',
      name: 'Scroll of Revivify',
      category: 'Scroll',
      quantity: 1,
      weight: 0.1,
      description: 'Touches a creature that has died within the last minute to return it to life with 1 HP.',
      valueGp: 300,
    }
  ];
}

export const partyStashStore = writable<PartyStashItem[]>(loadInitialStash());

// Auto-persist stash updates
partyStashStore.subscribe((items) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_STASH_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }
});

export class SessionStoreManager {
  getPartyStash(): PartyStashItem[] {
    return get(partyStashStore);
  }

  addItemToPartyStash(item: Partial<PartyStashItem> & { name: string }): PartyStashItem {
    const newItem: PartyStashItem = {
      id: `stash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: item.name,
      category: item.category || 'Gear',
      quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
      weight: item.weight !== undefined ? item.weight : 1.0,
      description: item.description || '',
      valueGp: item.valueGp,
    };

    partyStashStore.update(curr => {
      // Check if item already exists by name and category
      const existingIdx = curr.findIndex(i => i.name.toLowerCase() === newItem.name.toLowerCase());
      if (existingIdx >= 0) {
        const copy = [...curr];
        copy[existingIdx].quantity += newItem.quantity;
        return copy;
      }
      return [newItem, ...curr];
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:stash-updated', { detail: newItem }));
    }

    return newItem;
  }

  removePartyStashItem(id: string): void {
    partyStashStore.update(curr => curr.filter(i => i.id !== id));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:stash-updated', { detail: { id, deleted: true } }));
    }
  }

  /**
   * Adds a creature directly into active combat / encounter storage.
   * Generates a new combatant with calculated HP, AC, and rolled initiative.
   */
  addMonsterToCombat(creature: {
    name: string;
    hp?: number;
    ac?: number;
    cr?: number;
    description?: string;
  }): ActiveCombatant {
    let encounters: Record<string, SavedEncounter> = {};
    try {
      const raw = localStorage.getItem(STORAGE_ENCOUNTERS_KEY);
      if (raw) encounters = JSON.parse(raw);
    } catch {
      encounters = {};
    }

    // Find active encounter or first encounter, or create one
    let targetEncId = Object.keys(encounters)[0];
    if (!targetEncId) {
      targetEncId = `enc-${Date.now()}`;
      const newEnc: Encounter = {
        id: targetEncId,
        name: 'Active Combat Encounter',
        round: 1,
        current_turn_index: 0,
        is_active: true,
      };
      encounters[targetEncId] = { encounter: newEnc, combatants: [] };
    }

    // Roll d20 + 0 for default initiative
    const rolledInit = Math.floor(Math.random() * 20) + 1;
    const combatantId = `comb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const hpVal = creature.hp && creature.hp > 0 ? creature.hp : 15;
    const acVal = creature.ac && creature.ac > 0 ? creature.ac : 12;

    const newCombatant: ActiveCombatant = {
      id: combatantId,
      encounter_id: targetEncId,
      token_id: '',
      name: creature.name,
      initiative: rolledInit,
      hp_current: hpVal,
      hp_max: hpVal,
      temp_hp: 0,
      ac: acVal,
      is_monster: true,
      monster_compendium_id: null,
      multiattack_profile: null,
      conditions: [],
    };

    encounters[targetEncId].combatants = [
      ...encounters[targetEncId].combatants,
      newCombatant
    ];

    try {
      localStorage.setItem(STORAGE_ENCOUNTERS_KEY, JSON.stringify(encounters));
    } catch {
      // storage error
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:add-to-encounter', { detail: newCombatant }));
      window.dispatchEvent(new CustomEvent('vtt:switch-tab', { detail: { tab: 'encounter' } }));
    }

    return newCombatant;
  }
}

export const sessionStore = new SessionStoreManager();
