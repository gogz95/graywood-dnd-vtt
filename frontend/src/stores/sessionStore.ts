// sessionStore.ts — Master session state coordinator for 5e VTT Workstation
// Coordinates Active Combat injection, Party Stash, and Aleamos Table Rules Automation

import { writable, get } from 'svelte/store';
import type { ActiveCombatant, SavedEncounter, Encounter } from '../types/combat';
import { sendWsEvent, dispatchLocalWhisper, type CombatTurnSync } from './websocketStore';
import { rulesEngine } from '../lib/stores/rulesEngine.svelte';

export interface PartyStashItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  weight: number;
  description: string;
  valueGp?: number;
  harvestedAtHour?: number;
  isPreserved?: boolean;
  isSpoiled?: boolean;
  appraisalPenaltyPercent?: number;
  essence?: string;
  creatureOrigin?: string;
}

// ─── Aleamos House Rules Automation ──────────────────────────────────────────

/**
 * 1. Tri-Stat Initiative Engine:
 * In both the character sheet and encounter builder, calculate initiative using:
 * max(DEX_modifier, INT_modifier, WIS_modifier) when enableTriStatInitiative is ON,
 * or standard DEX modifier when OFF.
 */
export function calculateTriStatInitiative(scores: { dex: number; int: number; wis: number }): {
  bonus: number;
  bestStat: 'DEX' | 'INT' | 'WIS';
  label: string;
} {
  const dexMod = Math.floor(((scores.dex ?? 10) - 10) / 2);
  const intMod = Math.floor(((scores.int ?? 10) - 10) / 2);
  const wisMod = Math.floor(((scores.wis ?? 10) - 10) / 2);

  let bestStat: 'DEX' | 'INT' | 'WIS' = 'DEX';
  let bonus = dexMod;

  if (intMod > bonus) {
    bonus = intMod;
    bestStat = 'INT';
  }
  if (wisMod > bonus) {
    bonus = wisMod;
    bestStat = 'WIS';
  }

  const sign = bonus >= 0 ? `+${bonus}` : `${bonus}`;
  return {
    bonus,
    bestStat,
    label: `${sign} (${bestStat})`,
  };
}

/**
 * 2. 0-HP Exhaustion Trigger ("Anti-Heal-Scumming"):
 * Whenever hpCurrent transitions to 0, automatically increment character Exhaustion level by 1.
 */
export const EXHAUSTION_PENALTIES: Record<number, string> = {
  1: 'Disadvantage on ability checks',
  2: 'Speed halved',
  3: 'Disadvantage on attack rolls and saving throws',
  4: 'Hit point maximum halved',
  5: 'Speed reduced to 0',
  6: 'Death',
};

export function applyHpMutationWithExhaustionCheck(
  currentHp: number,
  delta: number,
  maxHp: number,
  currentExhaustion: number = 0
): { nextHp: number; nextExhaustion: number; exhaustionTriggered: boolean } {
  const nextHp = Math.max(0, Math.min(maxHp, currentHp + delta));
  let nextExhaustion = currentExhaustion;
  let exhaustionTriggered = false;

  // Trigger on transition from alive (> 0) to knocked out (0)
  if (currentHp > 0 && nextHp === 0) {
    nextExhaustion = Math.min(6, currentExhaustion + 1);
    exhaustionTriggered = true;
  }

  return { nextHp, nextExhaustion, exhaustionTriggered };
}

/**
 * 3. Equipment Resistance Points (RP) & Sunder Tracker:
 * Weapons and armor track durability: { currentRp, maxRp }.
 * When reaching 0 RP, an automatic -1 penalty is applied to attacks or AC.
 */
export function calculateEquipmentDurability(item: {
  current_rp?: number;
  max_rp?: number;
  currentRp?: number;
  maxRp?: number;
}): {
  isBroken: boolean;
  effectivePenalty: number;
  percent: number;
  statusLabel: string;
} {
  const current = Math.max(0, item.current_rp ?? item.currentRp ?? 0);
  const max = Math.max(1, item.max_rp ?? item.maxRp ?? 1);
  const percent = Math.min(100, (current / max) * 100);
  const isBroken = current <= 0;

  return {
    isBroken,
    effectivePenalty: isBroken ? -1 : 0,
    percent,
    statusLabel: isBroken ? 'Fractured (-1 Penalty)' : percent <= 30 ? 'Worn' : 'Pristine',
  };
}

/**
 * 4. Party Effective Challenge Rating (CR) Recalculator:
 * Sum of active (non-sealed, non-NPC) party levels divided by active party count.
 */
export function calculatePartyEffectiveCr(members: Array<{ level?: number; isOrbSealed?: boolean; isNpc?: boolean }>): {
  totalLevels: number;
  activeCount: number;
  averageLevel: number;
  effectiveCr: string;
} {
  const active = members.filter(m => !m.isOrbSealed && !m.isNpc);
  if (active.length === 0) {
    return { totalLevels: 0, activeCount: 0, averageLevel: 0, effectiveCr: '0.0' };
  }
  const totalLevels = active.reduce((sum, m) => sum + (m.level || 1), 0);
  const averageLevel = totalLevels / active.length;
  return {
    totalLevels,
    activeCount: active.length,
    averageLevel: Math.round(averageLevel * 10) / 10,
    effectiveCr: averageLevel.toFixed(1),
  };
}

// 5e Standard XP Thresholds per character level [Easy, Medium, Hard, Deadly]
export const XP_THRESHOLDS_BY_LEVEL: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 300],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700],
};

export const CR_TO_XP: Record<string, number> = {
  '0': 10, '0.125': 25, '0.25': 50, '0.5': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
};

export type ThreatLevel = 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Deadly';

export function calculateEncounterThreat(
  partyMembers: Array<{ level?: number; isOrbSealed?: boolean; isNpc?: boolean }>,
  combatants: Array<{ cr?: number; is_monster?: boolean; isMonster?: boolean }>
): {
  threatLevel: ThreatLevel;
  partyEffectiveCr: string;
  totalMonsterXp: number;
  thresholdDeadly: number;
} {
  const party = calculatePartyEffectiveCr(partyMembers);
  const activePCs = partyMembers.filter(m => !m.isOrbSealed && !m.isNpc);

  let easy = 0, med = 0, hard = 0, deadly = 0;
  for (const pc of activePCs) {
    const lvl = Math.min(20, Math.max(1, pc.level || 1));
    const thresholds = XP_THRESHOLDS_BY_LEVEL[lvl] || [25, 50, 75, 100];
    easy += thresholds[0];
    med += thresholds[1];
    hard += thresholds[2];
    deadly += thresholds[3];
  }

  const monsters = combatants.filter(c => c.is_monster || c.isMonster);
  let totalMonsterXp = 0;
  for (const m of monsters) {
    const crStr = String(m.cr ?? 1);
    totalMonsterXp += CR_TO_XP[crStr] ?? (Math.max(1, m.cr ?? 1) * 200);
  }

  let threatLevel: ThreatLevel = 'Trivial';
  if (totalMonsterXp >= deadly && deadly > 0) threatLevel = 'Deadly';
  else if (totalMonsterXp >= hard && hard > 0) threatLevel = 'Hard';
  else if (totalMonsterXp >= med && med > 0) threatLevel = 'Medium';
  else if (totalMonsterXp >= easy && easy > 0) threatLevel = 'Easy';

  return {
    threatLevel,
    partyEffectiveCr: party.effectiveCr,
    totalMonsterXp,
    thresholdDeadly: deadly,
  };
}

// ─── Session Persistence Keys ────────────────────────────────────────────────
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
export const collaborativeStashStore = partyStashStore;

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

// In-memory player packs cache for high-speed reactive access and testing environments
const inMemoryPlayerPacks = new Map<string, any[]>();

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
      harvestedAtHour: item.harvestedAtHour,
      isPreserved: item.isPreserved,
      isSpoiled: item.isSpoiled,
      appraisalPenaltyPercent: item.appraisalPenaltyPercent,
      essence: item.essence,
      creatureOrigin: item.creatureOrigin,
    };

    partyStashStore.update(curr => {
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
   */
  addMonsterToCombat(creature: {
    name: string;
    hp?: number;
    ac?: number;
    cr?: number;
    description?: string;
    dex?: number;
    int?: number;
    wis?: number;
  }): ActiveCombatant {
    let encounters: Record<string, SavedEncounter> = {};
    try {
      const raw = localStorage.getItem(STORAGE_ENCOUNTERS_KEY);
      if (raw) encounters = JSON.parse(raw);
    } catch {
      encounters = {};
    }

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

    // Roll tri-stat initiative: d20 + max(dex, int, wis)
    const tri = calculateTriStatInitiative({
      dex: creature.dex ?? 10,
      int: creature.int ?? 10,
      wis: creature.wis ?? 10,
    });
    const rolledInit = Math.floor(Math.random() * 20) + 1 + tri.bonus;
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

    // Broadcast turn order update
    this.broadcastActiveCombat();

    return newCombatant;
  }

  /**
   * Broadcasts active combat turn order to all connected players
   */
  broadcastActiveCombat(): void {
    let encounters: Record<string, SavedEncounter> = {};
    try {
      const raw = localStorage.getItem(STORAGE_ENCOUNTERS_KEY);
      if (raw) encounters = JSON.parse(raw);
    } catch {
      return;
    }

    const encIds = Object.keys(encounters);
    if (encIds.length === 0) return;

    const enc = encounters[encIds[0]];
    if (!enc) return;

    const sorted = [...enc.combatants].sort((a, b) => b.initiative - a.initiative);
    const currentIndex = enc.encounter.current_turn_index % Math.max(1, sorted.length);
    const onDeckIndex = (currentIndex + 1) % Math.max(1, sorted.length);

    const payload: CombatTurnSync = {
      encounter_id: enc.encounter.id,
      round: enc.encounter.round,
      current_turn_index: currentIndex,
      combatants: sorted.map((c, idx) => ({
        id: c.id,
        // Anonymize hidden monsters if any
        name: c.is_monster && c.conditions?.includes('Invisible') ? 'Unknown Threat' : c.name,
        initiative: c.initiative,
        is_active: idx === currentIndex,
        is_on_deck: idx === onDeckIndex,
        is_player: !c.is_monster,
        hp_percent: c.hp_max > 0 ? Math.round((c.hp_current / c.hp_max) * 100) : 0,
      })),
    };

    sendWsEvent({
      type: 'COMBAT_INITIATIVE_UPDATE',
      encounter_id: payload.encounter_id,
      round: payload.round,
      current_turn_index: payload.current_turn_index,
      combatants: payload.combatants,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:combat-turn-sync', { detail: payload }));
    }
  }

  /**
   * Advances the combat initiative turn order, ticks down condition durations on the expiring combatant,
   * increments rounds when looping, and broadcasts updates to connected players and projectors.
   */
  nextCombatTurn(): void {
    let encounters: Record<string, SavedEncounter> = {};
    try {
      const raw = localStorage.getItem(STORAGE_ENCOUNTERS_KEY);
      if (raw) encounters = JSON.parse(raw);
    } catch {
      return;
    }

    const encIds = Object.keys(encounters);
    if (encIds.length === 0) return;
    const enc = encounters[encIds[0]];
    if (!enc || enc.combatants.length === 0) return;

    const sorted = [...enc.combatants].sort((a, b) => b.initiative - a.initiative);
    const prevIdx = enc.encounter.current_turn_index % sorted.length;
    const expiringCombatant = sorted[prevIdx];

    // Decrement condition duration counters on expiring combatant
    if (expiringCombatant && expiringCombatant.conditions) {
      expiringCombatant.conditions = expiringCombatant.conditions
        .map((c) => {
          const match = c.match(/\((\d+)\s*(?:rnd|round|turns?)?\)/i);
          if (match) {
            const count = parseInt(match[1], 10) - 1;
            if (count <= 0) return null; // expired
            return c.replace(/\(\d+\s*(?:rnd|round|turns?)?\)/i, `(${count} rnd)`);
          }
          return c;
        })
        .filter(Boolean) as string[];

      const orig = enc.combatants.find((c) => c.id === expiringCombatant.id);
      if (orig) orig.conditions = expiringCombatant.conditions;
    }

    // Advance turn index
    enc.encounter.current_turn_index++;
    if (enc.encounter.current_turn_index >= sorted.length) {
      enc.encounter.current_turn_index = 0;
      enc.encounter.round++;
    }

    try {
      localStorage.setItem(STORAGE_ENCOUNTERS_KEY, JSON.stringify(encounters));
    } catch {
      // ignore
    }

    this.broadcastActiveCombat();
  }

  /**
   * Steps back one turn in initiative.
   */
  prevCombatTurn(): void {
    let encounters: Record<string, SavedEncounter> = {};
    try {
      const raw = localStorage.getItem(STORAGE_ENCOUNTERS_KEY);
      if (raw) encounters = JSON.parse(raw);
    } catch {
      return;
    }

    const encIds = Object.keys(encounters);
    if (encIds.length === 0) return;
    const enc = encounters[encIds[0]];
    if (!enc || enc.combatants.length === 0) return;

    if (enc.encounter.current_turn_index > 0) {
      enc.encounter.current_turn_index--;
    } else {
      if (enc.encounter.round > 1) {
        enc.encounter.round--;
        enc.encounter.current_turn_index = Math.max(0, enc.combatants.length - 1);
      }
    }

    try {
      localStorage.setItem(STORAGE_ENCOUNTERS_KEY, JSON.stringify(encounters));
    } catch {
      // ignore
    }

    this.broadcastActiveCombat();
  }

  /**
   * Sends a private DM whisper to a specific player character
   */
  sendDmWhisper(targetPinOrId: string, message: string, targetName?: string): void {
    const whisper = {
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      target_character_id: targetPinOrId,
      target_pin: targetPinOrId,
      sender_name: 'Dungeon Master',
      message: message.trim(),
      timestamp: Date.now(),
    };

    sendWsEvent({
      type: 'DM_WHISPER',
      id: whisper.id,
      target_character_id: whisper.target_character_id,
      target_pin: whisper.target_pin,
      sender_name: whisper.sender_name,
      message: whisper.message,
      timestamp: whisper.timestamp,
    });

    dispatchLocalWhisper(whisper);
  }

  /**
   * Automates the Aleamos Black Orb Temporal Extraction Protocol
   * - Pulls the character from active combat initiative.
   * - Recalculates party encounter Challenge Rating.
   * - Deposits a 1-lb indestructible wondrous item into party inventory.
   * - Severs client /play connection with ORB_STOWED.
   */
  stowCharacterIntoBlackOrb(characterId: string, characterName: string, pin?: string): {
    success: boolean;
    effectiveCr: string;
  } {
    // 1. Pull from active combat encounters
    let encounters: Record<string, SavedEncounter> = {};
    try {
      const rawEnc = localStorage.getItem(STORAGE_ENCOUNTERS_KEY);
      if (rawEnc) {
        encounters = JSON.parse(rawEnc);
        for (const encId of Object.keys(encounters)) {
          encounters[encId].combatants = encounters[encId].combatants.filter(
            (c: any) => c.id !== characterId && c.name.toLowerCase() !== characterName.toLowerCase()
          );
        }
        localStorage.setItem(STORAGE_ENCOUNTERS_KEY, JSON.stringify(encounters));
      }
    } catch {
      // ignore
    }

    // 2. Deposit 1-lb indestructible wondrous item into party stash
    const orbItemId = `item-black-orb-${characterId}`;
    this.addItemToPartyStash({
      id: orbItemId,
      name: `Black Orb of ${characterName}`,
      category: 'Wondrous Item',
      quantity: 1,
      weight: 1.0,
      description: `An indestructible, pitch-black sphere of frozen obsidian holding the temporal essence of ${characterName}. While inside, time is suspended and memory is veiled.`,
      valueGp: 0,
    });

    // 3. Mark character in roster storage as isOrbSealed: true
    let effectiveCr = '0.0';
    try {
      const rawRoster = localStorage.getItem('vtt_party_roster');
      if (rawRoster) {
        const roster = JSON.parse(rawRoster);
        const updated = roster.map((m: any) => m.id === characterId ? { ...m, isOrbSealed: true } : m);
        localStorage.setItem('vtt_party_roster', JSON.stringify(updated));
        effectiveCr = calculatePartyEffectiveCr(updated).effectiveCr;
      }
    } catch {
      // ignore
    }

    // 4. Broadcast WebSocket event to sever /play session
    sendWsEvent({
      type: 'BLACK_ORB_TOGGLE',
      character_id: characterId,
      is_orb_sealed: true,
    });

    // 5. Broadcast updated combat turns
    this.broadcastActiveCombat();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:black-orb-toggle', {
        detail: { character_id: characterId, is_orb_sealed: true }
      }));
      window.dispatchEvent(new CustomEvent('vtt:roster-updated', {}));
    }

    return { success: true, effectiveCr };
  }

  /**
   * Automates the Aleamos Black Orb Re-Entry Protocol
   * - Restores character sheet to active standing.
   * - Re-enables player PIN authentication.
   * - Removes the 1-lb wondrous item from party inventory.
   * - Recalculates party Challenge Rating.
   */
  releaseCharacterFromBlackOrb(characterId: string, characterName: string, pin?: string): {
    success: boolean;
    effectiveCr: string;
  } {
    // 1. Remove 1-lb wondrous item from party stash
    const orbItemId = `item-black-orb-${characterId}`;
    this.removePartyStashItem(orbItemId);

    // 2. Mark character in roster storage as isOrbSealed: false
    let effectiveCr = '0.0';
    try {
      const rawRoster = localStorage.getItem('vtt_party_roster');
      if (rawRoster) {
        const roster = JSON.parse(rawRoster);
        const updated = roster.map((m: any) => m.id === characterId ? { ...m, isOrbSealed: false } : m);
        localStorage.setItem('vtt_party_roster', JSON.stringify(updated));
        effectiveCr = calculatePartyEffectiveCr(updated).effectiveCr;
      }
    } catch {
      // ignore
    }

    // 3. Broadcast WebSocket event restoring /play session
    sendWsEvent({
      type: 'BLACK_ORB_TOGGLE',
      character_id: characterId,
      is_orb_sealed: false,
    });

    // 5. Broadcast active combat turns
    this.broadcastActiveCombat();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:black-orb-toggle', {
        detail: { character_id: characterId, is_orb_sealed: false }
      }));
      window.dispatchEvent(new CustomEvent('vtt:roster-updated', {}));
    }

    return { success: true, effectiveCr };
  }

  get collaborativeStash(): PartyStashItem[] {
    return this.getPartyStash();
  }

  addItemToCollaborativeStash(item: Partial<PartyStashItem> & { name: string }): PartyStashItem {
    return this.addItemToPartyStash(item);
  }

  /**
   * Retrieves player's personal pack items from in-memory cache or localStorage.
   */
  getPlayerPack(playerId: string): any[] {
    if (inMemoryPlayerPacks.has(playerId)) {
      return inMemoryPlayerPacks.get(playerId)!;
    }
    if (typeof localStorage !== 'undefined' && localStorage?.getItem) {
      try {
        const raw = localStorage.getItem(`vtt_player_inventory_${playerId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          inMemoryPlayerPacks.set(playerId, parsed);
          return parsed;
        }
      } catch {
        // ignore
      }
    }
    return [];
  }

  /**
   * Clears in-memory pack cache (useful for tests and resets).
   */
  clearPlayerPack(playerId?: string): void {
    if (playerId) {
      inMemoryPlayerPacks.delete(playerId);
      if (typeof localStorage !== 'undefined' && localStorage?.removeItem) {
        try { localStorage.removeItem(`vtt_player_inventory_${playerId}`); } catch {}
      }
    } else {
      inMemoryPlayerPacks.clear();
    }
  }

  /**
   * Injects an item directly into a player's personal pack, persisting to storage
   * and notifying reactive client views.
   */
  addItemToPlayerPack(playerId: string, item: any): { success: boolean; item: any } {
    const currentPack = this.getPlayerPack(playerId);
    const normalizedItem = {
      id: item.id || `pack-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: item.name,
      type: item.type || 'gear',
      category: item.category || 'Gear',
      rarity: item.rarity || 'Common',
      quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
      weight: item.weight !== undefined ? item.weight : item.weight_lbs !== undefined ? item.weight_lbs : 1.0,
      currentRp: item.currentRp !== undefined ? item.currentRp : item.current_rp !== undefined ? item.current_rp : (item.maxRp ?? 15),
      maxRp: item.maxRp !== undefined ? item.maxRp : item.max_rp !== undefined ? item.max_rp : 15,
      attackBonus: item.attackBonus,
      damageFormula: item.damageFormula,
      damageType: item.damageType,
      acBonus: item.acBonus,
      description: item.description || '',
      costGp: item.costGp !== undefined ? item.costGp : item.base_value_cp !== undefined ? Math.floor(item.base_value_cp / 100) : 0,
      isPerishable: Boolean(item.isPerishable || item.is_preserved === false),
      harvestTimestamp: item.harvestTimestamp !== undefined ? item.harvestTimestamp : item.harvest_timestamp !== undefined ? item.harvest_timestamp : null,
      essenceTag: item.essenceTag || item.essence || undefined,
    };

    const updatedPack = [normalizedItem, ...currentPack.filter(i => i.id !== normalizedItem.id)];
    inMemoryPlayerPacks.set(playerId, updatedPack);

    if (typeof localStorage !== 'undefined' && localStorage?.setItem) {
      try {
        localStorage.setItem(`vtt_player_inventory_${playerId}`, JSON.stringify(updatedPack));
      } catch (err) {
        console.error('Failed to persist player pack:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:inventory-updated', {
        detail: { characterId: playerId, item: normalizedItem }
      }));
    }

    return { success: true, item: normalizedItem };
  }

  /**
   * Executes an atomic peer-to-peer item trade between two players.
   * Decrements/removes item from sender's inventory, appends to receiver's inventory,
   * strictly preserving all custom metadata (durability RP, perishable decay timestamps, essence tags).
   */
  executePeerTrade(
    senderId: string,
    receiverId: string,
    itemId: string,
    quantity: number = 1
  ): { success: boolean; error?: string; transferredItem?: any } {
    if (!senderId || !receiverId) {
      return { success: false, error: 'Sender ID and Receiver ID are required.' };
    }
    if (senderId === receiverId) {
      return { success: false, error: 'Cannot trade with yourself.' };
    }
    if (quantity <= 0) {
      return { success: false, error: 'Trade quantity must be at least 1.' };
    }

    const senderPack = this.getPlayerPack(senderId);
    const itemIndex = senderPack.findIndex((i: any) => i.id === itemId);

    if (itemIndex === -1) {
      return { success: false, error: `Item "${itemId}" not found in sender's pack.` };
    }

    const sourceItem = senderPack[itemIndex];
    const availableQty = sourceItem.quantity && sourceItem.quantity > 0 ? sourceItem.quantity : 1;

    if (availableQty < quantity) {
      return {
        success: false,
        error: `Insufficient quantity: sender has ${availableQty}, requested ${quantity}.`
      };
    }

    // 1. Prepare transferred item with full metadata preservation
    const transferredItem = {
      ...sourceItem,
      id: `trade-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      quantity: quantity,
      currentRp: sourceItem.currentRp !== undefined ? sourceItem.currentRp : sourceItem.current_rp,
      maxRp: sourceItem.maxRp !== undefined ? sourceItem.maxRp : sourceItem.max_rp,
      harvestTimestamp: sourceItem.harvestTimestamp !== undefined ? sourceItem.harvestTimestamp : sourceItem.harvest_timestamp,
      isPerishable: sourceItem.isPerishable !== undefined ? sourceItem.isPerishable : sourceItem.is_preserved === false,
      essenceTag: sourceItem.essenceTag || sourceItem.essence,
      weight: sourceItem.weight !== undefined ? sourceItem.weight : sourceItem.weight_lbs,
    };

    // 2. Atomic mutation of sender inventory
    if (availableQty > quantity) {
      senderPack[itemIndex] = {
        ...sourceItem,
        quantity: availableQty - quantity,
      };
    } else {
      senderPack.splice(itemIndex, 1);
    }

    // 3. Atomic mutation of receiver inventory
    const receiverPack = this.getPlayerPack(receiverId);
    receiverPack.unshift(transferredItem);

    // 4. Atomic persistence
    inMemoryPlayerPacks.set(senderId, senderPack);
    inMemoryPlayerPacks.set(receiverId, receiverPack);

    if (typeof localStorage !== 'undefined' && localStorage?.setItem) {
      try {
        localStorage.setItem(`vtt_player_inventory_${senderId}`, JSON.stringify(senderPack));
        localStorage.setItem(`vtt_player_inventory_${receiverId}`, JSON.stringify(receiverPack));
      } catch (err) {
        console.error('Failed to commit atomic trade persistence:', err);
        return { success: false, error: 'Storage persistence error during atomic trade commit.' };
      }
    }

    // 5. Reactive client event dispatch
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:inventory-updated', {
        detail: { characterId: senderId }
      }));
      window.dispatchEvent(new CustomEvent('vtt:inventory-updated', {
        detail: { characterId: receiverId, item: transferredItem }
      }));
      window.dispatchEvent(new CustomEvent('vtt:peer-trade-executed', {
        detail: {
          senderId,
          receiverId,
          itemId,
          quantity,
          transferredItem,
        }
      }));
    }

    return {
      success: true,
      transferredItem,
    };
  }

  lastReceivedEvent: any = null;
  private subscribers = new Set<(state: SessionStoreManager) => void>();

  sendWebSocketMessage(payload: any) {
    sendWsEvent(payload);
  }

  subscribe(fn: (state: SessionStoreManager) => void) {
    this.subscribers.add(fn);
    fn(this);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  notifySubscribers() {
    for (const sub of this.subscribers) {
      try {
        sub(this);
      } catch (err) {
        console.error(err);
      }
    }
  }
}

export const sessionStore = new SessionStoreManager();

if (typeof window !== 'undefined') {
  window.addEventListener('vtt:battlemat-ws-event', ((e: CustomEvent) => {
    sessionStore.lastReceivedEvent = e.detail;
    sessionStore.notifySubscribers();
  }) as EventListener);
}

